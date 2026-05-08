const { ref, get, set, update } = require('firebase/database');
const axios = require('axios');

class ManagementLogsService {
  constructor(database, easyTimeService) {
    this.database = database;
    this.easyTimeService = easyTimeService;
    this.isProcessing = false;
    this.lastUpdateTime = null;
  }

  /**
   * Fetch today's transactions from EasyTime Pro API with pagination support.
   * Only fetches for today (midnight to now) to avoid re-processing historical data.
   * @param {number} limit - Max transactions to fetch (safety cap)
   * @returns {Promise<Array>} Array of transactions
   */
  async fetchTransactions(limit = 5000) {
    try {
      // Today's date string for client-side filtering (format matches API: "YYYY-MM-DD")
      const todayStr = new Date().toISOString().split('T')[0];

      console.log(`📊 Fetching transactions from EasyTime Pro for today (${todayStr}), limit: ${limit}...`);

      await this.easyTimeService.authenticate();

      let allTransactions = [];
      const pageSize = 1000;
      // ordering=punch_time (ascending) so newest entries appear last — we stop early once we pass today
      let nextUrl = `${this.easyTimeService.baseURL}/iclock/api/transactions/?limit=${pageSize}&ordering=-punch_time`;
      let pageCount = 0;
      const maxPages = Math.ceil(limit / pageSize);

      while (nextUrl && pageCount < maxPages) {
        console.log(`📄 Fetching page ${pageCount + 1}...`);

        const response = await axios.get(nextUrl, {
          headers: {
            'Authorization': `Token ${this.easyTimeService.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        const pageData = response.data.data || [];

        // Filter to today only (API returns newest first due to ordering=-punch_time)
        const todayData = pageData.filter(t => t.punch_time && t.punch_time.startsWith(todayStr));
        allTransactions = allTransactions.concat(todayData);

        // If this page had no records for today, all remaining pages are older — stop early
        if (todayData.length === 0 && pageData.length > 0) {
          console.log(`📅 No more today's records — stopping early`);
          break;
        }

        nextUrl = response.data.next;
        pageCount++;

        if (allTransactions.length >= limit) {
          allTransactions = allTransactions.slice(0, limit);
          break;
        }

        if (nextUrl) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Total today's transactions: ${allTransactions.length} across ${pageCount} pages`);
      return allTransactions;
    } catch (error) {
      console.error('❌ Error fetching transactions:', error.message);
      throw error;
    }
  }

  /**
   * Get data from Firebase collection
   * @param {string} collectionPath - Path to collection
   * @returns {Promise<Object>} Collection data
   */
  async getFirebaseData(collectionPath) {
    try {
      const dataRef = ref(this.database, collectionPath);
      const snapshot = await get(dataRef);
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
      console.error(`❌ Error fetching ${collectionPath}:`, error.message);
      return {};
    }
  }

  /**
   * Find staff by employee code
   * @param {string} empCode - Employee code
   * @param {Object} staffData - Staff data from Firebase
   * @returns {Object|null} Staff information
   */
  findStaffByEmpCode(empCode, staffData) {
    for (const [staffId, staffInfo] of Object.entries(staffData || {})) {
      if (staffInfo.username === empCode) {
        return { id: staffId, ...staffInfo };
      }
    }
    return null;
  }

  /**
   * Find student by employee code
   * @param {string} empCode - Employee code
   * @param {Object} studentsData - Students data from Firebase (nested by department)
   * @returns {Object|null} Student information
   */
  findStudentByEmpCode(empCode, studentsData) {
    for (const [deptName, deptStudents] of Object.entries(studentsData || {})) {
      if (deptStudents && typeof deptStudents === 'object') {
        for (const [studentId, studentInfo] of Object.entries(deptStudents)) {
          if (studentInfo.emp_code === empCode || studentInfo.username === empCode) {
            return {
              id: studentId,
              department: deptName,
              ...studentInfo
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Find approved pass request for student
   * @param {string} empCode - Employee code
   * @param {Object} passRequestsData - Pass requests data from Firebase
   * @returns {Object|null} Latest approved pass request
   */
  findApprovedPassRequest(empCode, passRequestsData) {
    const studentRequests = passRequestsData[empCode];
    if (!studentRequests) return null;

    let latestApprovedRequest = null;

    Object.values(studentRequests).forEach(request => {
      if (request.wardenApprovedBy && request.status === 'warden_approved') {
        if (!latestApprovedRequest ||
            new Date(request.createdAt) > new Date(latestApprovedRequest.createdAt)) {
          latestApprovedRequest = request;
        }
      }
    });

    return latestApprovedRequest;
  }

  /**
   * Process staff transaction
   * @param {Object} staffInfo - Staff information
   * @param {Object} transaction - Transaction from EasyTime Pro
   * @param {Object} existingLog - Existing log if any
   * @returns {Object} Processed staff log
   */
  processStaffTransaction(staffInfo, transaction, existingLog = null) {
    const punchTime = transaction.punch_time;
    
    if (existingLog) {
      // Update existing log with OUT time
      if (!existingLog.out) {
        return {
          ...existingLog,
          out: punchTime,
          status: 'Outside',
          lastUpdated: punchTime
        };
      } else if (!existingLog.in || new Date(punchTime) > new Date(existingLog.in)) {
        // Update IN time
        return {
          ...existingLog,
          in: punchTime,
          status: 'Inside',
          lastUpdated: punchTime
        };
      }
      return existingLog;
    }

    // Create new log entry
    return {
      id: staffInfo.username || staffInfo.id,
      name: staffInfo.name,
      department: staffInfo.department,
      in: punchTime,
      out: null,
      status: 'Inside',
      timestamp: punchTime,
      type: 'staff'
    };
  }

  /**
   * Process dayscholar transaction
   * @param {Object} studentInfo - Student information
   * @param {Object} transaction - Transaction from EasyTime Pro
   * @param {Object} existingLog - Existing log if any
   * @returns {Object} Processed dayscholar log
   */
  processDayscholarTransaction(studentInfo, transaction, existingLog = null) {
    const punchTime = transaction.punch_time;

    if (existingLog) {
      // Update existing log
      if (!existingLog.out) {
        return {
          ...existingLog,
          out: punchTime,
          status: 'Outside',
          lastUpdated: punchTime
        };
      } else {
        return {
          ...existingLog,
          in: punchTime,
          status: 'Inside',
          lastUpdated: punchTime
        };
      }
    }

    // Create new log entry
    return {
      id: studentInfo.emp_code || studentInfo.username,
      name: studentInfo.first_name,
      department: studentInfo.department,
      in: punchTime,
      out: null,
      status: 'Inside',
      timestamp: punchTime,
      type: 'dayscholar'
    };
  }

  /**
   * Process outing transaction for hosteller
   * @param {Object} studentInfo - Student information
   * @param {Object} transaction - Transaction from EasyTime Pro
   * @param {Object} passRequest - Pass request information
   * @param {Object} existingLog - Existing log if any
   * @returns {Object} Processed outing log
   */
  processOutingTransaction(studentInfo, transaction, passRequest, existingLog = null) {
    const punchTime = transaction.punch_time;

    if (existingLog) {
      // Update existing log with IN time
      if (!existingLog.in) {
        return {
          ...existingLog,
          in: punchTime,
          status: 'Inside',
          lastUpdated: punchTime
        };
      }
    }

    // Create new log entry (first punch = OUT for outing)
    return {
      id: studentInfo.emp_code || studentInfo.username,
      name: studentInfo.first_name,
      department: studentInfo.department,
      out: punchTime,
      in: null,
      status: 'Outside',
      timestamp: punchTime,
      type: 'outing',
      passRequestId: passRequest?.id || null
    };
  }

  /**
   * Process home visit transaction for hosteller
   * @param {Object} studentInfo - Student information
   * @param {Object} transaction - Transaction from EasyTime Pro
   * @param {Object} passRequest - Pass request information
   * @param {Object} existingLog - Existing log if any
   * @returns {Object} Processed home visit log
   */
  processHomeVisitTransaction(studentInfo, transaction, passRequest, existingLog = null) {
    const punchTime = transaction.punch_time;

    if (existingLog) {
      // Update existing log with IN time
      if (!existingLog.in) {
        return {
          ...existingLog,
          in: punchTime,
          status: 'Inside',
          lastUpdated: punchTime
        };
      }
    }

    // Create new log entry (first punch = OUT for home visit)
    return {
      id: studentInfo.emp_code || studentInfo.username,
      name: studentInfo.first_name,
      department: studentInfo.department,
      out: punchTime,
      in: null,
      status: 'Outside',
      timestamp: punchTime,
      type: 'home_visit',
      passRequestId: passRequest?.id || null
    };
  }

  /**
   * Process all transactions and organize by date
   * @param {Array} transactions - Array of transactions from EasyTime Pro
   * @returns {Promise<Object>} Transactions organized by date
   */
  async processTransactions(transactions) {
    try {
      console.log('🔄 Processing transactions and organizing by date...');

      // Fetch Firebase data
      const [staffData, studentsData, passRequestsData] = await Promise.all([
        this.getFirebaseData('staff'),
        this.getFirebaseData('students'),
        this.getFirebaseData('passRequests')
      ]);


      // Group transactions by date
      const transactionsByDate = {};
      let processedCount = 0;
      let notFoundCount = 0;
      
      for (const transaction of transactions) {
        const empCode = transaction.emp_code;
        const punchTime = transaction.punch_time;

        if (!empCode || !punchTime) continue;

        // Extract date from punch_time (format: "2025-09-18 09:46:48" -> "2025-09-18")
        const date = punchTime.split(' ')[0];

        // Initialize date object if it doesn't exist
        if (!transactionsByDate[date]) {
          transactionsByDate[date] = {};
        }

        // Check if staff or student exists in Firebase
        const staffEntry = this.findStaffByEmpCode(empCode, staffData);
        const studentEntry = this.findStudentByEmpCode(empCode, studentsData);

        if (staffEntry || studentEntry) {
          // Initialize emp_code entry if it doesn't exist
          if (!transactionsByDate[date][empCode]) {
            const name = staffEntry 
              ? (staffEntry.name || 'Unknown') 
              : (studentEntry ? (studentEntry.first_name || studentEntry.name || 'Unknown') : 'Unknown');
            
            const department = staffEntry 
              ? (staffEntry.department || 'Unknown') 
              : (studentEntry ? (studentEntry.department || 'Unknown') : 'Unknown');
            
            const position = staffEntry 
              ? (staffEntry.position || 'Unknown') 
              : (studentEntry ? (studentEntry.position || 'Unknown') : 'Unknown');

            transactionsByDate[date][empCode] = {
              emp_code: empCode,
              name: name,
              department: department,
              position: position,
              transactions: []
            };
          }

          // Add transaction to the emp_code's transactions array (only punch_time)
          transactionsByDate[date][empCode].transactions.push(punchTime);

          processedCount++;
        } else {
          notFoundCount++;
        }
      }
      
      console.log(`📊 Processing summary: ${processedCount} transactions processed across ${Object.keys(transactionsByDate).length} dates, ${notFoundCount} not found in Firebase`);

      return transactionsByDate;
    } catch (error) {
      console.error('❌ Error processing transactions:', error.message);
      throw error;
    }
  }

  /**
   * Save processed logs to Firebase management collection
   * Merges with existing data to preserve fields like 'type' and 'savedAt'
   * @param {Object} transactionsByDate - Transactions organized by date
   */
  async saveLogsToFirebase(transactionsByDate) {
    try {
      console.log('💾 Saving processed logs to Firebase management collection...');

      const savePromises = [];

      for (const [date, transactions] of Object.entries(transactionsByDate)) {
        // Fetch existing management data and ToHO data for this date in parallel
        const [existingData, toHOData] = await Promise.all([
          this.getFirebaseData(`management/${date}`),
          this.getFirebaseData(`ToHO/${date}`)
        ]);

        const mergedData = {};

        for (const [empCode, transactionData] of Object.entries(transactions)) {
          // Pull type from ToHO/{date}/{empCode} — the authoritative source
          const toHOEntry = toHOData[empCode];
          const type = toHOEntry && toHOEntry.type ? toHOEntry.type : null;

          const existing = existingData[empCode] || {};

          mergedData[empCode] = {
            ...transactionData,
            // ToHO type takes priority; fall back to whatever was already saved
            ...(type ? { type } : existing.type ? { type: existing.type } : {})
          };
        }

        // Preserve employees that exist in Firebase but had no transactions today
        for (const [empCode, existingEmployeeData] of Object.entries(existingData)) {
          if (!mergedData[empCode]) {
            mergedData[empCode] = existingEmployeeData;
          }
        }

        const dateRef = ref(this.database, `management/${date}`);
        savePromises.push(set(dateRef, mergedData));
      }

      await Promise.all(savePromises);

      console.log(`✅ Logs saved to Firebase (${Object.keys(transactionsByDate).length} dates)`);
      this.lastUpdateTime = new Date().toISOString();
    } catch (error) {
      console.error('❌ Error saving logs to Firebase:', error.message);
      throw error;
    }
  }

  /**
   * Fetch, process, and save transactions
   * @param {number} limit - Number of transactions to fetch
   * @returns {Promise<Object>} Processed logs organized by date
   */
  async fetchAndProcessTransactions(limit = 5000) {
    if (this.isProcessing) {
      console.log('⏳ Transaction processing already in progress...');
      return { success: false, message: 'Processing already in progress' };
    }

    try {
      this.isProcessing = true;
      console.log('🚀 Starting transaction fetch and processing...');

      // Fetch transactions from EasyTime Pro
      const transactions = await this.fetchTransactions(limit);

      // Process transactions and organize by date
      const transactionsByDate = await this.processTransactions(transactions);

      // Save to Firebase (each date as a separate document)
      await this.saveLogsToFirebase(transactionsByDate);

      this.isProcessing = false;
      return { 
        success: true, 
        data: {
          dates: Object.keys(transactionsByDate),
          totalDates: Object.keys(transactionsByDate).length,
          totalTransactionsProcessed: transactions.length,
          transactionsByDate: transactionsByDate
        }
      };
    } catch (error) {
      this.isProcessing = false;
      console.error('❌ Error in fetchAndProcessTransactions:', error.message);
      throw error;
    }
  }

  /**
   * Get processed logs from Firebase
   * @param {string} date - Optional specific date to fetch (format: YYYY-MM-DD)
   * @returns {Promise<Object>} Management logs
   */
  async getLogsFromFirebase(date = null) {
    try {
      if (date) {
        console.log(`📥 Fetching management logs for date: ${date}...`);
        const dateRef = ref(this.database, `management/${date}`);
        const snapshot = await get(dateRef);
        
        if (snapshot.exists()) {
          console.log(`✅ Management logs fetched for ${date}`);
          return { [date]: snapshot.val() };
        } else {
          console.log(`⚠️ No management logs found for date: ${date}`);
          return null;
        }
      } else {
        console.log('📥 Fetching all management logs from Firebase...');
        const managementRef = ref(this.database, 'management');
        const snapshot = await get(managementRef);
        
        if (snapshot.exists()) {
          console.log('✅ Management logs fetched successfully');
          return snapshot.val();
        } else {
          console.log('⚠️ No management logs found in Firebase');
          return null;
        }
      }
    } catch (error) {
      console.error('❌ Error fetching management logs:', error.message);
      throw error;
    }
  }

  /**
   * Get processing status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      lastUpdateTime: this.lastUpdateTime
    };
  }
}

module.exports = ManagementLogsService;

