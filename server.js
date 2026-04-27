// Force working directory to script location (required for Windows service)
process.chdir(__dirname);

const express = require('express');
const cors = require('cors');
const fs = require('fs');

// Force load .env using absolute path
require('dotenv').config({ path: __dirname + '/.env' });

// Logging function that writes to file and console
function log(...msg) {
  fs.appendFileSync(__dirname + "/backend.log", msg.join(" ") + "\n");
  console.log(...msg);
}

log("Backend service started at", new Date());

const FirebaseMonitor = require('./services/firebaseMonitor');
const EasyTimeProService = require('./services/easytimeService');
const ManagementLogsService = require('./services/managementLogsService');
const PassRequestMonitor = require('./services/passRequestMonitor');
const initializeManagementRoutes = require('./routes/managementRoutes');
const { database } = require('./firebaseConfig');

class EasyTimeProBridge {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3003;
    this.firebaseMonitor = new FirebaseMonitor();
    this.easyTimeService = new EasyTimeProService();
    this.managementLogsService = new ManagementLogsService(database, this.easyTimeService);
    this.passRequestMonitor = new PassRequestMonitor();
    this.isServerRunning = false;
    this.autoRefreshInterval = null;
  }

  /**
   * Initialize middleware
   */
  initializeMiddleware() {
    // Enable CORS for all routes
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      log(`📡 ${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'EasyTime Pro Bridge'
      });
    });

    // Root endpoint with API information
    this.app.get('/', (req, res) => {
      res.status(200).json({
        service: 'EasyTime Pro Bridge',
        version: '1.0.0',
        description: 'Bridge service between Firebase and EasyTime Pro API',
        endpoints: {
          health: '/health',
          status: '/status',
          root: '/'
        },
        features: [
          'Real-time Firebase monitoring',
          'Automatic EasyTime Pro API processing',
          'Staff and student management',
          'Status tracking and updates'
        ]
      });
    });

    // Service status endpoint
    this.app.get('/status', async (req, res) => {
      try {
        const firebaseStatus = await this.firebaseMonitor.testFirebaseConnection();
        const monitoringStatus = this.firebaseMonitor.getMonitoringStatus();
        const easyTimeStatus = this.easyTimeService.getServiceStatus();

        res.status(200).json({
          service: 'EasyTime Pro Bridge',
          timestamp: new Date().toISOString(),
          status: {
            server: this.isServerRunning ? 'running' : 'stopped',
            firebase: firebaseStatus ? 'connected' : 'disconnected',
            easyTimePro: easyTimeStatus.isAuthenticated ? 'authenticated' : 'not_authenticated',
            monitoring: monitoringStatus.isMonitoring ? 'active' : 'inactive'
          },
          details: {
            firebase: {
              connected: firebaseStatus,
              activeListeners: monitoringStatus.activeListeners,
              listenerPaths: monitoringStatus.listenerPaths
            },
            easyTimePro: easyTimeStatus,
            monitoring: {
              isMonitoring: monitoringStatus.isMonitoring,
              activeListeners: monitoringStatus.activeListeners
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          service: 'EasyTime Pro Bridge',
          timestamp: new Date().toISOString(),
          status: 'error',
          error: error.message
        });
      }
    });

    // Test EasyTime Pro connection endpoint
    this.app.get('/test/easytime', async (req, res) => {
      try {
        const authResult = await this.easyTimeService.authenticate();
        const status = this.easyTimeService.getServiceStatus();
        
        res.status(200).json({
          success: authResult,
          message: authResult ? 'EasyTime Pro connection successful' : 'EasyTime Pro connection failed',
          status: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test Firebase connection endpoint
    this.app.get('/test/firebase', async (req, res) => {
      try {
        const firebaseResult = await this.firebaseMonitor.testFirebaseConnection();
        
        res.status(200).json({
          success: firebaseResult,
          message: firebaseResult ? 'Firebase connection successful' : 'Firebase connection failed',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Manual trigger monitoring endpoint
    this.app.post('/monitoring/start', async (req, res) => {
      try {
        const result = await this.firebaseMonitor.startMonitoring();
        
        res.status(200).json({
          success: result,
          message: result ? 'Monitoring started successfully' : 'Failed to start monitoring',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Stop monitoring endpoint
    this.app.post('/monitoring/stop', (req, res) => {
      try {
        this.firebaseMonitor.stopMonitoring();
        
        res.status(200).json({
          success: true,
          message: 'Monitoring stopped successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test EasyTime Pro ID saving endpoint for staff
    this.app.post('/test/save-easytime-id', async (req, res) => {
      try {
        const { empCode, easyTimeProId } = req.body;
        
        if (!empCode || !easyTimeProId) {
          return res.status(400).json({
            success: false,
            error: 'empCode and easyTimeProId are required',
            timestamp: new Date().toISOString()
          });
        }

        // Test saving EasyTime Pro ID to staff collection
        await this.firebaseMonitor.saveEasyTimeProIdToStaff(empCode, easyTimeProId);
        
        res.status(200).json({
          success: true,
          message: `EasyTime Pro ID ${easyTimeProId} saved for staff ${empCode}`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test EasyTime Pro ID saving endpoint for students
    this.app.post('/test/save-easytime-id-student', async (req, res) => {
      try {
        const { empCode, easyTimeProId, departmentId } = req.body;
        
        if (!empCode || !easyTimeProId) {
          return res.status(400).json({
            success: false,
            error: 'empCode and easyTimeProId are required',
            timestamp: new Date().toISOString()
          });
        }

        const studentData = { department: departmentId || 1 }; // Default to Department (ID: 1)
        
        // Test saving EasyTime Pro ID to student's department collection
        await this.firebaseMonitor.saveEasyTimeProIdToStudent(empCode, easyTimeProId, studentData);
        
        const departmentName = this.firebaseMonitor.getDepartmentNameFromId(studentData.department);
        
        res.status(200).json({
          success: true,
          message: `EasyTime Pro ID ${easyTimeProId} saved for student ${empCode} in students/${departmentName} collection`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test edit staff endpoint
    this.app.post('/test/edit-staff', async (req, res) => {
      try {
        const { empCode, easyTimeProId, updatedData } = req.body;
        
        if (!empCode || !easyTimeProId || !updatedData) {
          return res.status(400).json({
            success: false,
            error: 'empCode, easyTimeProId, and updatedData are required',
            timestamp: new Date().toISOString()
          });
        }

        // Create edit data structure as it would come from Firebase
        const editData = {
          easyTimeProId: easyTimeProId,
          ...updatedData
        };

        // Test editing staff in EasyTime Pro
        const result = await this.easyTimeService.updateStaffMember(easyTimeProId, updatedData);
        
        res.status(200).json({
          success: result.success,
          message: result.success ? 'Staff edit successful' : 'Staff edit failed',
          data: result.data,
          error: result.error,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test edit student endpoint
    this.app.post('/test/edit-student', async (req, res) => {
      try {
        const { empCode, easyTimeProId, updatedData } = req.body;
        
        if (!empCode || !easyTimeProId || !updatedData) {
          return res.status(400).json({
            success: false,
            error: 'empCode, easyTimeProId, and updatedData are required',
            timestamp: new Date().toISOString()
          });
        }

        // Create edit data structure as it would come from Firebase
        const editData = {
          easyTimeProId: easyTimeProId,
          ...updatedData
        };

        // Test editing student in EasyTime Pro
        const result = await this.easyTimeService.updateStaffMember(easyTimeProId, updatedData);
        
        res.status(200).json({
          success: result.success,
          message: result.success ? 'Student edit successful' : 'Student edit failed',
          data: result.data,
          error: result.error,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test monitoring status endpoint
    this.app.get('/test/monitoring-status', (req, res) => {
      try {
        const monitoringStatus = this.firebaseMonitor.getMonitoringStatus();
        
        res.status(200).json({
          success: true,
          monitoring: monitoringStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test EasyTime Pro API directly
    this.app.get('/test/easytime-api', async (req, res) => {
      try {
        // Test authentication
        const authResult = await this.easyTimeService.authenticate();
        
        if (!authResult) {
          return res.status(500).json({
            success: false,
            error: 'Failed to authenticate with EasyTime Pro',
            timestamp: new Date().toISOString()
          });
        }

        // Test getting staff members
        const staffResult = await this.easyTimeService.getStaffMembers();
        
        res.status(200).json({
          success: true,
          message: 'EasyTime Pro API test successful',
          authentication: authResult,
          staffMembers: staffResult,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Test management logs with sample data
    this.app.post('/test/management-sample', async (req, res) => {
      try {
        log('🧪 Creating sample management logs for testing...');
        
        // Create sample management data
        const sampleData = {
          allLogs: [
            {
              id: "001",
              name: "John Doe",
              department: "CSE",
              in: "2024-01-15T09:00:00Z",
              out: "2024-01-15T17:00:00Z",
              status: "Outside",
              timestamp: "2024-01-15T09:00:00Z",
              type: "staff"
            },
            {
              id: "12345",
              name: "Alice Smith",
              department: "ECE",
              in: "2024-01-15T08:30:00Z",
              out: null,
              status: "Inside",
              timestamp: "2024-01-15T08:30:00Z",
              type: "dayscholar"
            }
          ],
          staffLogs: [
            {
              id: "001",
              name: "John Doe",
              department: "CSE",
              in: "2024-01-15T09:00:00Z",
              out: "2024-01-15T17:00:00Z",
              status: "Outside",
              timestamp: "2024-01-15T09:00:00Z",
              type: "staff"
            }
          ],
          dayscholarLogs: [
            {
              id: "12345",
              name: "Alice Smith",
              department: "ECE",
              in: "2024-01-15T08:30:00Z",
              out: null,
              status: "Inside",
              timestamp: "2024-01-15T08:30:00Z",
              type: "dayscholar"
            }
          ],
          outingLogs: [],
          homeVisitLogs: [],
          lastUpdated: new Date().toISOString(),
          totalTransactionsProcessed: 2
        };

        // Save sample data to Firebase
        await this.managementLogsService.saveLogsToFirebase(sampleData);
        
        res.status(200).json({
          success: true,
          message: 'Sample management logs created successfully',
          data: sampleData,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Management logs routes
    const managementRoutes = initializeManagementRoutes(this.managementLogsService);
    this.app.use('/api/management', managementRoutes);
    this.app.use('/api/zkteco', managementRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /',
          'GET /health',
          'GET /status',
          'GET /test/easytime',
          'GET /test/firebase',
          'GET /test/monitoring-status',
          'GET /test/easytime-api',
          'POST /monitoring/start',
          'POST /monitoring/stop',
          'POST /test/save-easytime-id',
          'POST /test/save-easytime-id-student',
          'POST /test/edit-staff',
          'POST /test/edit-student',
          'GET /api/management/logs',
          'GET /api/management/logs?date=YYYY-MM-DD',
          'GET /api/management/logs/dates',
          'POST /api/management/refresh',
          'GET /api/management/status',
          'GET /api/zkteco/transactions',
          'GET /test/pass-request-status',
          'POST /test/clear-processed-requests'
        ],
        timestamp: new Date().toISOString()
      });
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      log('❌ Server error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });

    // Test endpoint for pass request monitoring status
    this.app.get('/test/pass-request-status', async (req, res) => {
      try {
        const status = this.passRequestMonitor.getMonitoringStatus();
        res.json({
          success: true,
          message: 'Pass Request monitoring status',
          data: status
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Test endpoint to clear processed requests
    this.app.post('/test/clear-processed-requests', async (req, res) => {
      try {
        this.passRequestMonitor.clearProcessedRequests();
        res.json({
          success: true,
          message: 'Processed requests cache cleared'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      log('🚀 Starting EasyTime Pro Bridge Server...');
      
      // Initialize middleware
      this.initializeMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Start the server
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        this.isServerRunning = true;
        log(`✅ EasyTime Pro Bridge Server running on port ${this.port}`);
        log(`🌐 Server URL: http://localhost:${this.port}`);
        log(`📊 Health Check: http://localhost:${this.port}/health`);
        log(`📈 Status: http://localhost:${this.port}/status`);
      });

      // Start Firebase monitoring
      log('🔥 Starting Firebase monitoring...');
      const monitoringStarted = await this.firebaseMonitor.startMonitoring();
      
      if (monitoringStarted) {
        log('✅ Firebase monitoring started successfully');
      } else {
        log('❌ Failed to start Firebase monitoring');
      }

      // Start Pass Request monitoring
      log('🎫 Starting Pass Request monitoring...');
      const passRequestMonitoringStarted = await this.passRequestMonitor.startMonitoring();
      
      if (passRequestMonitoringStarted) {
        log('✅ Pass Request monitoring started successfully');
      } else {
        log('❌ Failed to start Pass Request monitoring');
      }

      // Start auto-refresh for management logs
      this.startAutoRefresh();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      log('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  }

  /**
   * Start auto-refresh for management logs
   * Refreshes logs every 5 minutes
   */
  startAutoRefresh() {
    const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    
    log('🔄 Starting auto-refresh for management logs (every 5 minutes)...');
    
    // Initial refresh
    this.managementLogsService.fetchAndProcessTransactions()
      .then(() => {
        log('✅ Initial management logs refresh completed');
      })
      .catch((error) => {
        log('❌ Initial management logs refresh failed:', error.message);
      });

    // Set up interval for periodic refresh
    this.autoRefreshInterval = setInterval(async () => {
      try {
        log('🔄 Auto-refreshing management logs...');
        await this.managementLogsService.fetchAndProcessTransactions();
        log('✅ Management logs auto-refreshed successfully');
      } catch (error) {
        log('❌ Management logs auto-refresh failed:', error.message);
      }
    }, AUTO_REFRESH_INTERVAL);

    log('✅ Auto-refresh started successfully');
  }

  /**
   * Stop auto-refresh for management logs
   */
  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      log('✅ Auto-refresh stopped');
    }
  }

  /**
   * Setup graceful shutdown handling
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Stop auto-refresh
        this.stopAutoRefresh();
        
        // Stop Firebase monitoring
        this.firebaseMonitor.stopMonitoring();
        log('✅ Firebase monitoring stopped');
        
        // Close server
        if (this.server) {
          this.server.close(() => {
            log('✅ Server closed');
            this.isServerRunning = false;
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      } catch (error) {
        log('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    // Handle different termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log('❌ Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    try {
      log('🛑 Stopping EasyTime Pro Bridge Server...');
      
      // Stop auto-refresh
      this.stopAutoRefresh();
      
      // Stop Firebase monitoring
      this.firebaseMonitor.stopMonitoring();
      
      // Close server
      if (this.server) {
        this.server.close();
        this.isServerRunning = false;
        log('✅ Server stopped successfully');
      }
    } catch (error) {
      log('❌ Error stopping server:', error.message);
    }
  }
}

// Create and start the server
const bridge = new EasyTimeProBridge();

// Start the server
bridge.start().catch((error) => {
  log('❌ Failed to start EasyTime Pro Bridge:', error.message);
  process.exit(1);
});

module.exports = EasyTimeProBridge;
