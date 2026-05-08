const { ref, onValue, get, set } = require('firebase/database');
const { database } = require('../firebaseConfig');
const EasyTimeProService = require('./easytimeService');

class PassRequestMonitor {
  constructor() {
    this.database = database;
    this.easyTimeService = new EasyTimeProService();
    this.processedToNAEntries = new Set(); // Track processed ToNA entries (by path) for this session
    this.isMonitoring = false;
    this.toHOMonitorInterval = null; // Scheduled monitor for ToHO collection
  }

  /**
   * Start monitoring pass requests
   */
  async startMonitoring() {
    try {
      console.log('🔍 Starting pass request monitoring...');
      
      // Authenticate with EasyTime Pro
      const authSuccess = await this.easyTimeService.authenticate();
      if (!authSuccess) {
        console.error('❌ Failed to authenticate with EasyTime Pro');
        return false;
      }

      // Monitor passRequests collection (ToHO flow)
      const passRequestsRef = ref(this.database, 'passRequests');
      onValue(passRequestsRef, (snapshot) => {
        this.handlePassRequestChange(snapshot).catch((err) => {
          console.error('❌ Unhandled error in pass request handler:', err.message);
        });
      }, (error) => {
        console.error('❌ Firebase listener error (passRequests):', error.message);
      });

      // Monitor ToNA collection (return to NA flow)
      const toNARef = ref(this.database, 'ToNA');
      onValue(toNARef, (snapshot) => {
        this.handleToNAChange(snapshot).catch((err) => {
          console.error('❌ Unhandled error in ToNA handler:', err.message);
        });
      }, (error) => {
        console.error('❌ Firebase listener error (ToNA):', error.message);
      });

      // Start scheduled monitor for ToHO collection
      this.startToHOMonitor();

      this.isMonitoring = true;
      console.log('✅ Pass request monitoring started');
      return true;
    } catch (error) {
      console.error('❌ Error starting pass request monitoring:', error.message);
      return false;
    }
  }

  /**
   * Stop monitoring pass requests
   */
  stopMonitoring() {
    this.isMonitoring = false;
    this.stopToHOMonitor();
    console.log('⏹️ Pass request monitoring stopped');
  }

  /**
   * Handle ToNA collection changes
   * Accepts flexible shapes under `ToNA` and looks for any node containing an `employees` array.
   * For each unprocessed node, calls adjust_area with areas [3] and marks it processed.
   * @param {Object} snapshot - Firebase snapshot
   */
  async handleToNAChange(snapshot) {
    try {
      const data = snapshot.val();
      if (!data) return;

      console.log('📋 Processing ToNA changes...');

      // Depth-first traversal to find any entries that contain an `employees` array
      const tasks = [];
      const traverse = (node, pathParts) => {
        if (!node || typeof node !== 'object') return;

        const hasEmployees = Array.isArray(node.employees) && node.employees.length > 0;
        if (hasEmployees) {
          const pathKey = pathParts.join('/');
          tasks.push({ pathKey, node });
        }

        for (const key of Object.keys(node)) {
          if (node[key] && typeof node[key] === 'object') {
            traverse(node[key], [...pathParts, key]);
          }
        }
      };

      traverse(data, []);

      for (const task of tasks) {
        const { pathKey, node } = task;

        // Skip if already processed in-memory or marked in DB
        if (this.processedToNAEntries.has(pathKey)) {
          console.log(`⏭️ Skipping ToNA ${pathKey} - already processed (cache)`);
          continue;
        }

        // If node has processedAt, treat as processed
        if (node.processedAt) {
          this.processedToNAEntries.add(pathKey);
          console.log(`⏭️ Skipping ToNA ${pathKey} - already processed (timestamp)`);
          continue;
        }

        const employees = node.employees.filter((e) => !!e);
        if (!employees.length) continue;

        // Add to in-memory cache BEFORE processing so concurrent listener fires skip it
        this.processedToNAEntries.add(pathKey);

        console.log(`🎯 Processing ToNA area change for ${pathKey} (one-by-one)`);

        let successCount = 0;
        let failureCount = 0;

        // Process employees sequentially, one request per employee
        for (const employeeId of employees) {
          const result = await this.easyTimeService.changeEmployeeArea([employeeId], [3]);
          const resultRef = ref(this.database, `ToNA/${pathKey}/results/${employeeId}`);
          if (result.success) {
            successCount++;
            await set(resultRef, { success: true, at: new Date().toISOString() });
            console.log(`✅ ToNA area change successful for ${employeeId}`);
          } else {
            failureCount++;
            await set(resultRef, { success: false, error: String(result.error || 'unknown_error'), at: new Date().toISOString() });
            console.error(`❌ ToNA area change failed for ${employeeId}:`, result.error);
          }
        }

        // Mark the entry processed (regardless of individual failures) to avoid loops
        await set(ref(this.database, `ToNA/${pathKey}/processedAt`), new Date().toISOString());
        await set(ref(this.database, `ToNA/${pathKey}/summary`), { successCount, failureCount });
        this.processedToNAEntries.add(pathKey);
        console.log(`📦 ToNA ${pathKey} processed. success=${successCount}, failed=${failureCount}`);
      }
    } catch (error) {
      console.error('❌ Error handling ToNA changes:', error.message);
    }
  }

  /**
   * Handle pass request collection changes
   * @param {Object} snapshot - Firebase snapshot
   */
  async handlePassRequestChange(snapshot) {
    try {
      const data = snapshot.val();
      if (!data) return;

      console.log('📋 Processing pass request changes...');

      for (const empCode in data) {
        const requests = data[empCode];
        
        // Handle both single request and multiple requests
        if (requests.id) {
          // Single request
          await this.processPassRequest(empCode, requests);
        } else {
          // Multiple requests (object with request IDs as keys)
          for (const requestId in requests) {
            const request = requests[requestId];
            if (request && request.id) {
              await this.processPassRequest(empCode, request, requestId);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error handling pass request change:', error.message);
    }
  }

  /**
   * Process individual pass request
   * @param {string} empCode - Employee code
   * @param {Object} request - Request data
   * @param {string} requestId - Request ID (for multiple requests)
   */
  async processPassRequest(empCode, request, requestId = null) {
    try {
      const fullRequestId = requestId || request.id;

      // Skip if not warden_approved — covers 'area_changed', 'completed', 'pending', etc.
      if (request.status !== 'warden_approved') {
        return;
      }

      console.log(`🎯 Processing warden_approved request: ${fullRequestId} for ${empCode}`);

      // Find student in students collection
      const studentData = await this.findStudentByEmpCode(empCode);
      if (!studentData) {
        console.log(`⚠️ Student not found for emp_code: ${empCode}`);
        return;
      }

      // Get easyTimeProId
      const easyTimeProId = studentData.easyTimeProId;
      if (!easyTimeProId) {
        console.log(`⚠️ No easyTimeProId found for student: ${empCode}`);
        return;
      }

      // Get request type
      const requestType = request.type; // "outing" or "home_visit"
      
      // Save to ToHO collection FIRST (date/empCode structure) with type
      console.log(`📝 About to save ToHO for ${empCode}, type: ${requestType || 'N/A'}`);
      try {
        await this.saveToToHOCollection(easyTimeProId, empCode, requestType);
        console.log(`✅ ToHO save completed for ${empCode}`);
      } catch (toHOError) {
        console.error(`❌ CRITICAL: ToHO save failed for ${empCode}:`, toHOError);
        console.error(`❌ ToHO Error details:`, {
          message: toHOError.message,
          stack: toHOError.stack,
          code: toHOError.code,
          name: toHOError.name
        });
        // Don't continue if ToHO save fails - this is critical
        throw toHOError;
      }
      
      // THEN change area to 2 (HO)
      const areaChangeResult = await this.easyTimeService.changeEmployeeArea([easyTimeProId], [2]);

      if (areaChangeResult.success) {
        // Update Firebase status — this is the durable record; no in-memory Set needed
        const statusPath = requestId
          ? `passRequests/${empCode}/${requestId}/status`
          : `passRequests/${empCode}/status`;
        try {
          await set(ref(this.database, statusPath), 'area_changed');
        } catch (statusErr) {
          console.error(`⚠️ Could not update passRequest status in Firebase:`, statusErr.message);
        }

        console.log(`✅ Area changed successfully for ${empCode} (${easyTimeProId})`);
      } else {
        console.error(`❌ Failed to change area for ${empCode}:`, areaChangeResult.error);
        // Note: ToHO collection was already saved, but area change failed
        console.log(`⚠️ ToHO collection saved but area change failed for ${empCode}`);
      }

    } catch (error) {
      console.error('❌ Error processing pass request:', error.message);
    }
  }

  /**
   * Find student by emp_code in students collection
   * @param {string} empCode - Employee code
   * @returns {Promise<Object|null>} Student data or null
   */
  async findStudentByEmpCode(empCode) {
    try {
      const studentsRef = ref(this.database, 'students');
      const snapshot = await get(studentsRef);

      if (!snapshot.exists()) {
        console.log(`⚠️ students collection is empty`);
        return null;
      }

      const studentsData = snapshot.val();

      for (const department in studentsData) {
        const deptStudents = studentsData[department];
        if (!deptStudents || typeof deptStudents !== 'object') continue;

        // Case 1: empCode is the direct key (e.g. students/CSE/21CS001)
        if (deptStudents[empCode]) {
          console.log(`🔍 Found student ${empCode} in students/${department} (by key)`);
          return deptStudents[empCode];
        }

        // Case 2: empCode stored as emp_code or username field under an auto-generated key
        for (const key of Object.keys(deptStudents)) {
          const student = deptStudents[key];
          if (
            student &&
            typeof student === 'object' &&
            (student.emp_code === empCode || student.username === empCode)
          ) {
            console.log(`🔍 Found student ${empCode} in students/${department}/${key} (by field)`);
            return student;
          }
        }
      }

      console.log(`⚠️ Student ${empCode} not found in any department`);
      return null;
    } catch (error) {
      console.error('❌ Error finding student:', error.message);
      return null;
    }
  }

  /**
   * Save area change data to ToHO collection
   * @param {string} easyTimeProId - EasyTime Pro ID
   * @param {string} empCode - Employee code
   * @param {string} type - Request type ("outing" or "home_visit")
   */
  async saveToToHOCollection(easyTimeProId, empCode, type) {
    // Compute today's date (YYYY-MM-DD)
    const dateStr = new Date().toISOString().split('T')[0];
    const path = `ToHO/${dateStr}/${empCode}`;

    console.log(`💾 [ToHO] Starting save process...`);
    console.log(`💾 [ToHO] Path: ${path}`);
    console.log(`💾 [ToHO] Employee ID: ${easyTimeProId}, EmpCode: ${empCode}, Type: ${type || 'N/A'}`);

    // Validate inputs
    if (!easyTimeProId) {
      throw new Error(`easyTimeProId is required but was: ${easyTimeProId}`);
    }
    if (!empCode) {
      throw new Error(`empCode is required but was: ${empCode}`);
    }
    if (!this.database) {
      throw new Error('Database instance is not available');
    }

    // Strict structure: matches ToNA shape, includes type
    const toHOData = {
      employees: [easyTimeProId],
      areas: [2],
      type: type || null,
      createdAt: new Date().toISOString()
    };

    console.log(`💾 [ToHO] Data to save:`, JSON.stringify(toHOData, null, 2));

    try {
      const toHORef = ref(this.database, path);
      console.log(`💾 [ToHO] Reference created, attempting set()...`);
      
      await set(toHORef, toHOData);
      console.log(`💾 [ToHO] set() completed without error`);
      
      // Wait a moment for Firebase to sync
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify the save was successful
      console.log(`💾 [ToHO] Verifying save...`);
      const verifyRef = ref(this.database, path);
      const verifySnapshot = await get(verifyRef);
      
      if (verifySnapshot.exists()) {
        const savedData = verifySnapshot.val();
        console.log(`✅ [ToHO] Successfully saved and verified: ${path}`);
        console.log(`✅ [ToHO] Saved data:`, JSON.stringify(savedData, null, 2));
        return true;
      } else {
        const errorMsg = `⚠️ [ToHO] Save appeared successful but verification failed: ${path}`;
        console.error(errorMsg);
        // Try to read parent to see if path structure is wrong
        const parentRef = ref(this.database, `ToHO/${dateStr}`);
        const parentSnapshot = await get(parentRef);
        console.log(`🔍 [ToHO] Parent node exists:`, parentSnapshot.exists());
        if (parentSnapshot.exists()) {
          console.log(`🔍 [ToHO] Parent node data:`, JSON.stringify(parentSnapshot.val(), null, 2));
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorDetails = {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      };
      console.error(`❌ [ToHO] CRITICAL ERROR saving to ${path}:`);
      console.error(`❌ [ToHO] Error details:`, JSON.stringify(errorDetails, null, 2));
      
      // Check if it's a permission error
      if (error.code === 'PERMISSION_DENIED' || error.message.includes('permission')) {
        console.error(`❌ [ToHO] PERMISSION DENIED - Check Firebase rules for ToHO collection`);
      }
      
      // Re-throw to be caught by caller
      throw error;
    }
  }


  /**
   * Get monitoring status
   * @returns {Object} Status information
   */
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      processedToNAEntries: Array.from(this.processedToNAEntries),
      processedToNACount: this.processedToNAEntries.size
    };
  }

  /**
   * Start scheduled monitor for ToHO collection
   * Checks entries periodically for transaction verification and 24-hour rule for "outing" type
   */
  startToHOMonitor() {
    // Run every hour (3600000 ms)
    const MONITOR_INTERVAL = 60 * 60 * 1000;
    
    console.log('🔄 Starting ToHO scheduled monitor (runs every hour)...');
    
    // Run immediately on start
    this.checkToHOEntries();
    
    // Set up interval for periodic checks
    this.toHOMonitorInterval = setInterval(() => {
      this.checkToHOEntries();
    }, MONITOR_INTERVAL);
  }

  /**
   * Stop scheduled monitor for ToHO collection
   */
  stopToHOMonitor() {
    if (this.toHOMonitorInterval) {
      clearInterval(this.toHOMonitorInterval);
      this.toHOMonitorInterval = null;
      console.log('⏹️ ToHO scheduled monitor stopped');
    }
  }

  /**
   * Check ToHO entries for transaction verification and 24-hour rule
   */
  async checkToHOEntries() {
    try {
      console.log('🔍 Checking ToHO entries for transaction verification and 24-hour rule...');
      
      const toHORef = ref(this.database, 'ToHO');
      const snapshot = await get(toHORef);
      
      if (!snapshot.exists()) {
        console.log('📭 No ToHO entries found');
        return;
      }

      const toHOData = snapshot.val();
      const now = new Date();
      const tasks = [];

      // Traverse all dates and empCodes
      for (const date in toHOData) {
        if (!toHOData[date] || typeof toHOData[date] !== 'object') continue;
        
        for (const empCode in toHOData[date]) {
          const entry = toHOData[date][empCode];
          if (!entry || !entry.employees || !Array.isArray(entry.employees) || entry.employees.length === 0) continue;

          const easyTimeProId = entry.employees.find((e) => !!e);
          if (!easyTimeProId) continue;
          const type = entry.type;
          const createdAt = entry.createdAt ? new Date(entry.createdAt) : null;
          
          // Skip if already processed/monitored
          if (entry.monitoredAt || entry.autoConvertedAt) continue;
          
          tasks.push({ date, empCode, easyTimeProId, type, createdAt, entry });
        }
      }

      console.log(`📋 Found ${tasks.length} ToHO entries to check`);

      for (const task of tasks) {
        const { date, empCode, easyTimeProId, type, createdAt, entry } = task;
        
        try {
          // For "home_visit" type: no time restrictions, just verify transactions
          if (type === 'home_visit') {
            await this.verifyToHOTransactions(date, empCode, easyTimeProId, entry);
            continue;
          }
          
          // For "outing" type: check 24-hour rule
          if (type === 'outing') {
            if (!createdAt) {
              console.log(`⚠️ ToHO entry ${date}/${empCode} has no createdAt timestamp, skipping 24-hour check`);
              await this.verifyToHOTransactions(date, empCode, easyTimeProId, entry);
              continue;
            }
            
            const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
            
            if (hoursSinceCreation >= 24) {
              // Check if already converted to ToNA (area 3)
              const isConvertedToNA = await this.checkIfConvertedToNA(easyTimeProId);
              
              if (!isConvertedToNA) {
                console.log(`⚠️ ToHO entry ${date}/${empCode} (outing) exceeded 24 hours without ToNA conversion`);
                
                // Mark as monitored and flag for attention
                await set(ref(this.database, `ToHO/${date}/${empCode}/monitoredAt`), now.toISOString());
                await set(ref(this.database, `ToHO/${date}/${empCode}/exceeded24Hours`), true);
                await set(ref(this.database, `ToHO/${date}/${empCode}/exceeded24HoursAt`), now.toISOString());
                
                // Verify transactions
                await this.verifyToHOTransactions(date, empCode, easyTimeProId, entry);
              } else {
                console.log(`✅ ToHO entry ${date}/${empCode} (outing) already converted to ToNA`);
                await set(ref(this.database, `ToHO/${date}/${empCode}/monitoredAt`), now.toISOString());
              }
            } else {
              // Less than 24 hours, just verify transactions
              await this.verifyToHOTransactions(date, empCode, easyTimeProId, entry);
            }
          } else {
            // No type specified, just verify transactions
            await this.verifyToHOTransactions(date, empCode, easyTimeProId, entry);
          }
        } catch (error) {
          console.error(`❌ Error checking ToHO entry ${date}/${empCode}:`, error.message);
        }
      }
      
      console.log(`✅ ToHO entries check completed`);
    } catch (error) {
      console.error('❌ Error checking ToHO entries:', error.message);
    }
  }

  /**
   * Verify if employee has transactions after being moved to HO
   * @param {string} date - Date string (YYYY-MM-DD)
   * @param {string} empCode - Employee code
   * @param {string} easyTimeProId - EasyTime Pro ID
   * @param {Object} entry - ToHO entry data
   */
  async verifyToHOTransactions(date, empCode, easyTimeProId, entry) {
    try {
      // Check management collection for transactions
      const managementRef = ref(this.database, `management/${date}/${empCode}`);
      const managementSnapshot = await get(managementRef);
      
      if (managementSnapshot.exists()) {
        const managementData = managementSnapshot.val();
        const hasTransactions = managementData.transactions && 
                                Array.isArray(managementData.transactions) && 
                                managementData.transactions.length > 0;
        
        await set(ref(this.database, `ToHO/${date}/${empCode}/hasTransactions`), hasTransactions);
        await set(ref(this.database, `ToHO/${date}/${empCode}/transactionCheckAt`), new Date().toISOString());
        
        if (hasTransactions) {
          console.log(`✅ ToHO entry ${date}/${empCode} has transactions`);
        } else {
          console.log(`⚠️ ToHO entry ${date}/${empCode} has no transactions`);
        }
      } else {
        await set(ref(this.database, `ToHO/${date}/${empCode}/hasTransactions`), false);
        await set(ref(this.database, `ToHO/${date}/${empCode}/transactionCheckAt`), new Date().toISOString());
        console.log(`⚠️ ToHO entry ${date}/${empCode} has no management data (no transactions)`);
      }
    } catch (error) {
      console.error(`❌ Error verifying transactions for ${date}/${empCode}:`, error.message);
    }
  }

  /**
   * Check if employee has been converted to ToNA (area 3)
   * @param {string} easyTimeProId - EasyTime Pro ID
   * @returns {Promise<boolean>} True if converted to ToNA
   */
  async checkIfConvertedToNA(easyTimeProId) {
    try {
      // Check ToNA collection for this employee
      const toNARef = ref(this.database, 'ToNA');
      const toNASnapshot = await get(toNARef);
      
      if (!toNASnapshot.exists()) {
        return false;
      }
      
      const toNAData = toNASnapshot.val();
      
      // Traverse ToNA structure to find if this employee was processed
      const traverse = (node) => {
        if (!node || typeof node !== 'object') return false;
        
        if (Array.isArray(node.employees)) {
          if (node.employees.includes(easyTimeProId)) {
            // Check if this entry has been processed
            if (node.processedAt || node.results?.[easyTimeProId]) {
              return true;
            }
          }
        }
        
        for (const key in node) {
          if (traverse(node[key])) {
            return true;
          }
        }
        
        return false;
      };
      
      return traverse(toNAData);
    } catch (error) {
      console.error(`❌ Error checking ToNA conversion for ${easyTimeProId}:`, error.message);
      return false;
    }
  }
}

module.exports = PassRequestMonitor;
