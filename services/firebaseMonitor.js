const { ref, onValue, set, get } = require('firebase/database');
const { database, testFirebaseConnection } = require('../firebaseConfig');
const EasyTimeProService = require('./easytimeService');

// Department ID → Firebase collection name mapping.
// Add new departments here whenever the system grows.
const DEPARTMENTS = [
  { id: 1,  name: 'Department' },
  { id: 2,  name: 'CSE' },
  { id: 3,  name: 'ECE' },
  { id: 4,  name: 'MECH' },
  { id: 5,  name: 'CIVIL' },
  { id: 6,  name: 'IT' },
  { id: 7,  name: 'AIML' },
  { id: 8,  name: 'CYBER SECURITY' },
  { id: 9,  name: 'AIDS' },
  { id: 10, name: 'EEE' },
  { id: 11, name: 'DCSE' },
  { id: 12, name: 'DECE' },
  { id: 13, name: 'DMECH' },
  { id: 14, name: 'ADMIN' },
  { id: 15, name: 'S&H' },
  { id: 17, name: 'OTHERS' },
  { id: 18, name: 'DAUTO' },
  { id: 19, name: 'DEEE' },
];

class FirebaseMonitor {
  constructor() {
    this.database = database;
    this.easyTimeService = new EasyTimeProService();
    this.isMonitoring = false;
    this.listeners = new Map();
  }

  /**
   * Start monitoring Firebase collections
   * @returns {Promise<boolean>} Monitoring start status
   */
  async startMonitoring() {
    try {
      console.log('🔥 Starting Firebase monitoring...');
      
      // Test Firebase connection (no authentication needed since rules allow public access)
      const firebaseConnectionSuccess = await testFirebaseConnection();
      if (!firebaseConnectionSuccess) {
        console.error('❌ Failed to connect to Firebase. Monitoring not started.');
        return false;
      }
      
      // Authenticate with EasyTime Pro
      const authSuccess = await this.easyTimeService.authenticate();
      if (!authSuccess) {
        console.error('❌ Failed to authenticate with EasyTime Pro. Monitoring not started.');
        return false;
      }

      // Start monitoring staff management
      await this.monitorStaffManagement();
      
      // Start monitoring student management
      await this.monitorStudentManagement();
      
      // Start monitoring edit operations
      await this.monitorEditOperations();

      this.isMonitoring = true;
      console.log('✅ Firebase monitoring started successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to start Firebase monitoring:', error.message);
      return false;
    }
  }

  /**
   * Stop monitoring Firebase collections
   */
  stopMonitoring() {
    try {
      console.log('🛑 Stopping Firebase monitoring...');
      
      // Remove all listeners
      this.listeners.forEach((unsubscribe, path) => {
        unsubscribe();
        console.log(`📡 Removed listener for: ${path}`);
      });
      
      this.listeners.clear();
      this.isMonitoring = false;
      console.log('✅ Firebase monitoring stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping Firebase monitoring:', error.message);
    }
  }

  /**
   * Monitor staff management collections
   */
  async monitorStaffManagement() {
    try {
      console.log('👥 Setting up staff management monitoring...');
      
      // Monitor Adding Staff collection
      const addingStaffRef = ref(this.database, 'staff_management/Adding Staff');
      const addingStaffUnsubscribe = onValue(addingStaffRef, (snapshot) => {
        this.handleStaffCollectionChange(snapshot, 'Adding Staff');
      }, (error) => {
        console.error('❌ Error monitoring Adding Staff:', error);
      });
      this.listeners.set('staff_management/Adding Staff', addingStaffUnsubscribe);

      // Monitor Removing Staff collection
      const removingStaffRef = ref(this.database, 'staff_management/Removing Staff');
      const removingStaffUnsubscribe = onValue(removingStaffRef, (snapshot) => {
        this.handleStaffCollectionChange(snapshot, 'Removing Staff');
      }, (error) => {
        console.error('❌ Error monitoring Removing Staff:', error);
      });
      this.listeners.set('staff_management/Removing Staff', removingStaffUnsubscribe);

      console.log('✅ Staff management monitoring setup complete');
    } catch (error) {
      console.error('❌ Failed to setup staff management monitoring:', error.message);
    }
  }

  /**
   * Monitor student management collections
   */
  async monitorStudentManagement() {
    try {
      console.log('🎓 Setting up student management monitoring...');
      
      // Monitor Adding Student collection
      const addingStudentRef = ref(this.database, 'student_management/Adding Student');
      const addingStudentUnsubscribe = onValue(addingStudentRef, (snapshot) => {
        this.handleStudentCollectionChange(snapshot, 'Adding Student');
      }, (error) => {
        console.error('❌ Error monitoring Adding Student:', error);
      });
      this.listeners.set('student_management/Adding Student', addingStudentUnsubscribe);

      // Monitor Removing Student collection
      const removingStudentRef = ref(this.database, 'student_management/Removing Student');
      const removingStudentUnsubscribe = onValue(removingStudentRef, (snapshot) => {
        this.handleStudentCollectionChange(snapshot, 'Removing Student');
      }, (error) => {
        console.error('❌ Error monitoring Removing Student:', error);
      });
      this.listeners.set('student_management/Removing Student', removingStudentUnsubscribe);

      console.log('✅ Student management monitoring setup complete');
    } catch (error) {
      console.error('❌ Failed to setup student management monitoring:', error.message);
    }
  }

  /**
   * Monitor edit operations for staff and students
   */
  async monitorEditOperations() {
    try {
      console.log('✏️ Setting up edit operations monitoring...');
      
      // Monitor staff_details collection for edits
      const staffDetailsRef = ref(this.database, 'staff_details');
      const staffDetailsUnsubscribe = onValue(staffDetailsRef, (snapshot) => {
        this.handleEditCollectionChange(snapshot, 'staff_details');
      }, (error) => {
        console.error('❌ Error monitoring staff_details:', error);
      });
      this.listeners.set('staff_details', staffDetailsUnsubscribe);

      // Monitor student_details collection for edits
      const studentDetailsRef = ref(this.database, 'student_details');
      const studentDetailsUnsubscribe = onValue(studentDetailsRef, (snapshot) => {
        this.handleEditCollectionChange(snapshot, 'student_details');
      }, (error) => {
        console.error('❌ Error monitoring student_details:', error);
      });
      this.listeners.set('student_details', studentDetailsUnsubscribe);

      console.log('✅ Edit operations monitoring setup complete');
    } catch (error) {
      console.error('❌ Failed to setup edit operations monitoring:', error.message);
    }
  }

  /**
   * Handle staff collection changes
   * @param {Object} snapshot - Firebase snapshot
   * @param {string} collectionType - Type of collection (Adding Staff/Removing Staff)
   */
  async handleStaffCollectionChange(snapshot, collectionType) {
    try {
      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.val();
      console.log(`📊 Staff collection change detected: ${collectionType}`);

      for (const empCode in data) {
        const staffData = data[empCode];
        
        if (staffData.status === 'pending') {
          const currentStatusRef = ref(this.database, `staff_management/${collectionType}/${empCode}/status`);
          const currentStatusSnap = await get(currentStatusRef);

          if (!currentStatusSnap.exists() || currentStatusSnap.val() !== 'pending') {
            console.log(`⏭️ Skipping ${empCode} - status changed to ${currentStatusSnap.val() || 'unknown'} (already processed)`);
            continue;
          }

          // Immediately claim this record to block concurrent duplicate processing
          await set(currentStatusRef, 'processing');

          console.log(`🔄 Processing ${collectionType} for employee: ${empCode}`);

          if (collectionType === 'Adding Staff') {
            await this.processAddStaff(empCode, staffData);
          } else if (collectionType === 'Removing Staff') {
            await this.processRemoveStaff(empCode, staffData);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error handling staff collection change:`, error.message);
    }
  }

  /**
   * Handle student collection changes
   * @param {Object} snapshot - Firebase snapshot
   * @param {string} collectionType - Type of collection (Adding Student/Removing Student)
   */
  async handleStudentCollectionChange(snapshot, collectionType) {
    try {
      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.val();
      console.log(`📊 Student collection change detected: ${collectionType}`);

      for (const empCode in data) {
        const studentData = data[empCode];
        
        if (studentData.status === 'pending') {
          const currentStatusRef = ref(this.database, `student_management/${collectionType}/${empCode}/status`);
          const currentStatusSnap = await get(currentStatusRef);

          if (!currentStatusSnap.exists() || currentStatusSnap.val() !== 'pending') {
            console.log(`⏭️ Skipping ${empCode} - status changed to ${currentStatusSnap.val() || 'unknown'} (already processed)`);
            continue;
          }

          // Immediately claim this record to block concurrent duplicate processing
          await set(currentStatusRef, 'processing');

          console.log(`🔄 Processing ${collectionType} for student: ${empCode}`);

          if (collectionType === 'Adding Student') {
            await this.processAddStudent(empCode, studentData);
          } else if (collectionType === 'Removing Student') {
            await this.processRemoveStudent(empCode, studentData);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error handling student collection change:`, error.message);
    }
  }

  /**
   * Handle edit collection changes (staff_details and student_details)
   * @param {Object} snapshot - Firebase snapshot
   * @param {string} collectionType - Type of collection (staff_details/student_details)
   */
  async handleEditCollectionChange(snapshot, collectionType) {
    try {
      if (!snapshot.exists()) {
        console.log(`📊 No data found in ${collectionType} collection`);
        return;
      }

      const data = snapshot.val();
      console.log(`📊 Edit collection change detected: ${collectionType}`);
      console.log(`📊 Data received:`, JSON.stringify(data, null, 2));

      for (const empCode in data) {
        const editData = data[empCode];
        console.log(`📊 Processing ${empCode}:`, JSON.stringify(editData, null, 2));
        
        if (editData.status === 'pending') {
          const currentStatusRef = ref(this.database, `${collectionType}/${empCode}/status`);
          const currentStatusSnap = await get(currentStatusRef);

          if (!currentStatusSnap.exists() || currentStatusSnap.val() !== 'pending') {
            console.log(`⏭️ Skipping ${empCode} - status changed to ${currentStatusSnap.val() || 'unknown'} (already processed)`);
            continue;
          }

          // Immediately claim this record to block concurrent duplicate processing
          await set(currentStatusRef, 'processing');

          console.log(`🔄 Processing edit for ${collectionType}: ${empCode}`);

          if (collectionType === 'staff_details') {
            await this.processEditStaff(empCode, editData);
          } else if (collectionType === 'student_details') {
            await this.processEditStudent(empCode, editData);
          }
        } else {
          console.log(`⏭️ Skipping ${empCode} - status is ${editData.status} (not pending)`);
        }
      }
    } catch (error) {
      console.error(`❌ Error handling edit collection change:`, error.message);
    }
  }

  /**
   * Process staff addition
   * @param {string} empCode - Employee code
   * @param {Object} staffData - Staff data
   */
  async processAddStaff(empCode, staffData) {
    try {
      console.log(`👤 Processing staff addition for: ${empCode}`);
      
      const result = await this.easyTimeService.addStaffMember(staffData.data);
      
      if (result.success) {
        // Save easyTimeProId to staff collection
        if (result.data && result.data.id) {
          await this.saveEasyTimeProIdToStaff(empCode, result.data.id);
          console.log(`💾 Saved easyTimeProId ${result.data.id} for staff: ${empCode}`);
        }
        
        await this.updateStaffManagementStatus('Adding Staff', empCode, 'completed');
        console.log(`✅ Staff addition completed for: ${empCode}`);
      } else {
        await this.updateStaffManagementStatus('Adding Staff', empCode, 'failed');
        console.error(`❌ Staff addition failed for: ${empCode}`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing staff addition for ${empCode}:`, error.message);
      await this.updateStaffManagementStatus('Adding Staff', empCode, 'failed');
    }
  }

  /**
   * Process staff removal
   * @param {string} empCode - Employee code
   * @param {Object} staffData - Staff data
   */
  async processRemoveStaff(empCode, staffData) {
    try {
      console.log(`🗑️ Processing staff removal for: ${empCode}`);
      
      // Prefer easyTimeProId from request; fallback to legacy staff_id; else read from staff collection
      let easyTimeProId = staffData?.data?.easyTimeProId || staffData?.data?.staff_id;
      if (!easyTimeProId) {
        try {
          const idSnap = await get(ref(this.database, `staff/${empCode}/easyTimeProId`));
          if (idSnap.exists()) {
            easyTimeProId = idSnap.val();
          }
        } catch (_) {}
      }

      if (!easyTimeProId) {
        console.error(`❌ No EasyTime Pro ID found for staff ${empCode}. Aborting deletion.`);
        await this.updateStaffManagementStatus('Removing Staff', empCode, 'failed');
        return;
      }

      const result = await this.easyTimeService.deleteStaffMember(easyTimeProId);
      
      if (result.success) {
        await this.updateStaffManagementStatus('Removing Staff', empCode, 'completed');
        console.log(`✅ Staff removal completed for: ${empCode}`);
      } else {
        await this.updateStaffManagementStatus('Removing Staff', empCode, 'failed');
        console.error(`❌ Staff removal failed for: ${empCode}`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing staff removal for ${empCode}:`, error.message);
      await this.updateStaffManagementStatus('Removing Staff', empCode, 'failed');
    }
  }

  /**
   * Process student addition
   * @param {string} empCode - Employee code
   * @param {Object} studentData - Student data
   */
  async processAddStudent(empCode, studentData) {
    try {
      console.log(`🎓 Processing student addition for: ${empCode}`);
      
      const result = await this.easyTimeService.addStaffMember(studentData.data);
      
      if (result.success) {
        // Save easyTimeProId to student's data in student_management collection
        if (result.data && result.data.id) {
          await this.saveEasyTimeProIdToStudent(empCode, result.data.id, studentData.data);
          console.log(`💾 Saved easyTimeProId ${result.data.id} for student: ${empCode}`);
        }
        
        await this.updateStudentManagementStatus('Adding Student', empCode, 'completed');
        console.log(`✅ Student addition completed for: ${empCode}`);
      } else {
        await this.updateStudentManagementStatus('Adding Student', empCode, 'failed');
        console.error(`❌ Student addition failed for: ${empCode}`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing student addition for ${empCode}:`, error.message);
      await this.updateStudentManagementStatus('Adding Student', empCode, 'failed');
    }
  }

  /**
   * Process student removal
   * @param {string} empCode - Employee code
   * @param {Object} studentData - Student data
   */
  async processRemoveStudent(empCode, studentData) {
    try {
      console.log(`🗑️ Processing student removal for: ${empCode}`);
      
      // Prefer easyTimeProId from request; fallback to legacy staff_id; else read from students collection
      let easyTimeProId = studentData?.data?.easyTimeProId || studentData?.data?.staff_id;
      if (!easyTimeProId) {
        try {
          // Find department and then read student's saved easyTimeProId
          const departmentName = this.getDepartmentNameFromId(studentData?.data?.department);
          if (departmentName) {
            const idSnap = await get(ref(this.database, `students/${departmentName}/${empCode}/easyTimeProId`));
            if (idSnap.exists()) {
              easyTimeProId = idSnap.val();
            }
          }
        } catch (_) {}
      }

      if (!easyTimeProId) {
        console.error(`❌ No EasyTime Pro ID found for student ${empCode}. Aborting deletion.`);
        await this.updateStudentManagementStatus('Removing Student', empCode, 'failed');
        return;
      }

      const result = await this.easyTimeService.deleteStaffMember(easyTimeProId);
      
      if (result.success) {
        await this.updateStudentManagementStatus('Removing Student', empCode, 'completed');
        console.log(`✅ Student removal completed for: ${empCode}`);
      } else {
        await this.updateStudentManagementStatus('Removing Student', empCode, 'failed');
        console.error(`❌ Student removal failed for: ${empCode}`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing student removal for ${empCode}:`, error.message);
      await this.updateStudentManagementStatus('Removing Student', empCode, 'failed');
    }
  }

  /**
   * Process staff edit
   * @param {string} empCode - Employee code
   * @param {Object} editData - Edit data containing easyTimeProId and updated data
   */
  async processEditStaff(empCode, editData) {
    try {
      console.log(`✏️ Processing staff edit for: ${empCode}`);
      
      // Extract easyTimeProId from the edit data
      const easyTimeProId = editData.easyTimeProId;
      if (!easyTimeProId) {
        console.error(`❌ No easyTimeProId found for staff ${empCode}`);
        await this.updateEditStatus('staff_details', empCode, 'failed');
        return;
      }
      
      // Extract the updated data (excluding status and easyTimeProId)
      const { status, easyTimeProId: _, ...updatedData } = editData;
      
      console.log(`🔧 Updating staff ${empCode} with easyTimeProId: ${easyTimeProId}`);
      console.log(`📝 Updated data (excluding status and easyTimeProId):`, JSON.stringify(updatedData, null, 2));
      
      const result = await this.easyTimeService.updateStaffMember(easyTimeProId, updatedData);
      
      if (result.success) {
        await this.updateEditStatus('staff_details', empCode, 'completed');
        console.log(`✅ Staff edit completed for: ${empCode}`);
      } else {
        await this.updateEditStatus('staff_details', empCode, 'failed');
        console.error(`❌ Staff edit failed for: ${empCode}`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing staff edit for ${empCode}:`, error.message);
      await this.updateEditStatus('staff_details', empCode, 'failed');
    }
  }

  /**
   * Process student edit
   * @param {string} empCode - Employee code
   * @param {Object} editData - Edit data containing easyTimeProId and updated data
   */
  async processEditStudent(empCode, editData) {
    try {
      console.log(`✏️ Processing student edit for: ${empCode}`);
      
      // Extract easyTimeProId from the edit data
      let easyTimeProId = editData.easyTimeProId;
      
      // easyTimeProId missing — the student likely exists in EasyTime Pro but the ID wasn't saved.
      // Search EasyTime Pro by emp_code first to avoid creating a duplicate entry.
      if (!easyTimeProId) {
        console.log(`⚠️ No easyTimeProId for student ${empCode}. Searching EasyTime Pro by emp_code...`);

        const { status, easyTimeProId: _, timestamp, updatedAt, area_code, area_name, birthday, ...studentData } = editData;

        // Step 1: try to find the existing record
        const existing = await this.easyTimeService.findEmployeeByEmpCode(empCode);

        if (existing && existing.id) {
          easyTimeProId = existing.id;
          console.log(`✅ Found existing EasyTime Pro record for ${empCode}, ID: ${easyTimeProId}. Saving to Firebase...`);
          await this.saveEasyTimeProIdToStudent(empCode, easyTimeProId, studentData);
        } else {
          // Step 2: genuinely not in EasyTime Pro — add them
          console.log(`ℹ️ Student ${empCode} not found in EasyTime Pro. Adding...`);

          const cleanedStudentData = {
            emp_code: studentData.emp_code,
            first_name: studentData.first_name,
            department: studentData.department,
            position: studentData.position,
            area: studentData.area
          };
          if (studentData['aadhaar no']) cleanedStudentData['aadhaar no'] = studentData['aadhaar no'];
          if (studentData['contact no']) cleanedStudentData['contact no'] = studentData['contact no'];

          const addResult = await this.easyTimeService.addStaffMember(cleanedStudentData);

          if (addResult.success && addResult.data && addResult.data.id) {
            easyTimeProId = addResult.data.id;
            console.log(`✅ Added student ${empCode} to EasyTime Pro with ID: ${easyTimeProId}`);
            await this.saveEasyTimeProIdToStudent(empCode, easyTimeProId, studentData);
          } else {
            console.error(`❌ Could not find or add student ${empCode} in EasyTime Pro:`, addResult.error);
            await this.updateEditStatus('student_details', empCode, 'failed');
            return;
          }
        }
      }
      
      // Extract the updated data (excluding status and easyTimeProId)
      const { status, easyTimeProId: _, timestamp, updatedAt, area_code, area_name, birthday, ...updatedData } = editData;
      
      // Clean the data for EasyTime Pro API
      const cleanedData = {
        emp_code: updatedData.emp_code,
        first_name: updatedData.first_name,
        department: updatedData.department,
        position: updatedData.position,
        area: updatedData.area
      };
      
      // Add optional fields only if they exist and are valid
      if (updatedData['aadhaar no']) {
        cleanedData['aadhaar no'] = updatedData['aadhaar no'];
      }
      if (updatedData['contact no']) {
        cleanedData['contact no'] = updatedData['contact no'];
      }
      
      console.log(`🔧 Updating student ${empCode} with easyTimeProId: ${easyTimeProId}`);
      console.log(`📝 Cleaned data for EasyTime Pro:`, JSON.stringify(cleanedData, null, 2));
      
      const result = await this.easyTimeService.updateStaffMember(easyTimeProId, cleanedData);
      
      if (result.success) {
        await this.updateEditStatus('student_details', empCode, 'completed');
        console.log(`✅ Student edit completed for: ${empCode}`);
      } else {
        await this.updateEditStatus('student_details', empCode, 'failed');
        console.error(`❌ Student edit failed for: ${empCode}`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error processing student edit for ${empCode}:`, error.message);
      await this.updateEditStatus('student_details', empCode, 'failed');
    }
  }

  /**
   * Update staff management status in Firebase
   * @param {string} collectionPath - Collection path
   * @param {string} empCode - Employee code
   * @param {string} status - New status
   */
  async updateStaffManagementStatus(collectionPath, empCode, status) {
    try {
      const statusRef = ref(this.database, `staff_management/${collectionPath}/${empCode}/status`);
      await set(statusRef, status);
      console.log(`📝 Updated staff management status: ${collectionPath}/${empCode} -> ${status}`);
    } catch (error) {
      console.error(`❌ Failed to update staff management status:`, error.message);
    }
  }

  /**
   * Update student management status in Firebase
   * @param {string} collectionPath - Collection path
   * @param {string} empCode - Employee code
   * @param {string} status - New status
   */
  async updateStudentManagementStatus(collectionPath, empCode, status) {
    try {
      const statusRef = ref(this.database, `student_management/${collectionPath}/${empCode}/status`);
      await set(statusRef, status);
      console.log(`📝 Updated student management status: ${collectionPath}/${empCode} -> ${status}`);
    } catch (error) {
      console.error(`❌ Failed to update student management status:`, error.message);
    }
  }

  /**
   * Update edit status in Firebase
   * @param {string} collectionName - Collection name (staff_details/student_details)
   * @param {string} empCode - Employee code
   * @param {string} status - New status
   */
  async updateEditStatus(collectionName, empCode, status) {
    try {
      const statusRef = ref(this.database, `${collectionName}/${empCode}/status`);
      await set(statusRef, status);
      console.log(`📝 Updated edit status: ${collectionName}/${empCode} -> ${status}`);
    } catch (error) {
      console.error(`❌ Failed to update edit status:`, error.message);
    }
  }

  /**
   * Save easyTimeProId to staff collection in Firebase
   * @param {string} empCode - Employee code (username)
   * @param {string} easyTimeProId - EasyTime Pro ID returned from API
   */
  async saveEasyTimeProIdToStaff(empCode, easyTimeProId) {
    try {
      console.log(`💾 Saving easyTimeProId ${easyTimeProId} for staff ${empCode} to Firebase...`);
      
      // Update the staff record in the staff collection
      const staffRef = ref(this.database, `staff/${empCode}/easyTimeProId`);
      await set(staffRef, easyTimeProId);
      
      console.log(`✅ Successfully saved easyTimeProId ${easyTimeProId} for staff ${empCode}`);
    } catch (error) {
      console.error(`❌ Failed to save easyTimeProId for staff ${empCode}:`, error.message);
    }
  }

  /**
   * Save easyTimeProId to student's data in the appropriate department collection
   * @param {string} empCode - Employee code (username)
   * @param {string} easyTimeProId - EasyTime Pro ID returned from API
   * @param {Object} studentData - Student data containing department information
   */
  async saveEasyTimeProIdToStudent(empCode, easyTimeProId, studentData) {
    try {
      console.log(`💾 Saving easyTimeProId ${easyTimeProId} for student ${empCode} to students collection...`);
      
      // Get the department name from the department ID in student data
      const departmentName = this.getDepartmentNameFromId(studentData.department);
      
      if (departmentName) {
        // Save easyTimeProId within the student's data in the students collection under the department
        const studentRef = ref(this.database, `students/${departmentName}/${empCode}/easyTimeProId`);
        await set(studentRef, easyTimeProId);
        
        console.log(`✅ Successfully saved easyTimeProId ${easyTimeProId} for student ${empCode} in students/${departmentName} collection`);
      } else {
        console.error(`❌ Could not find department name for ID: ${studentData.department}`);
      }
    } catch (error) {
      console.error(`❌ Failed to save easyTimeProId for student ${empCode}:`, error.message);
    }
  }

  /**
   * Get department name from department ID
   * @param {number|string} departmentId - Department ID
   * @returns {string|null} Department name or null if not found
   */
  getDepartmentNameFromId(departmentId) {
    const dept = DEPARTMENTS.find(d => d.id == departmentId);
    if (!dept) {
      console.error(`❌ Unknown department ID: ${departmentId}. Add it to the DEPARTMENTS list at the top of firebaseMonitor.js`);
      return null;
    }
    return dept.name;
  }

  /**
   * Find the actual collection where a student is stored
   * @param {string} empCode - Employee code
   * @returns {Promise<string|null>} Collection name or null if not found
   */
  async findStudentCollection(empCode) {
    try {
      // Check common department collections
      const collections = ['Department', 'CSE', 'ECE', 'CYBER SECURITY', '1'];
      
      for (const collection of collections) {
        const studentRef = ref(this.database, `${collection}/${empCode}`);
        const snapshot = await get(studentRef);
        
        if (snapshot.exists()) {
          console.log(`📍 Found student ${empCode} in ${collection} collection`);
          return collection;
        }
      }
      
      console.log(`❌ Student ${empCode} not found in any department collection`);
      return null;
    } catch (error) {
      console.error(`❌ Error finding student collection for ${empCode}:`, error.message);
      return null;
    }
  }

  /**
   * Get monitoring status
   * @returns {Object} Monitoring status information
   */
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      activeListeners: this.listeners.size,
      listenerPaths: Array.from(this.listeners.keys()),
      easyTimeServiceStatus: this.easyTimeService.getServiceStatus()
    };
  }

  /**
   * Test Firebase connection
   * @returns {Promise<boolean>} Connection test result
   */
  async testFirebaseConnection() {
    try {
      // Try to read from an existing path that has permissions
      const testRef = ref(this.database, 'staff_management');
      await get(testRef);
      console.log('✅ Firebase connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Firebase connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = FirebaseMonitor;
