const express = require('express');
const router = express.Router();

/**
 * Initialize management routes
 * @param {Object} managementLogsService - Management logs service instance
 * @returns {Router} Express router
 */
function initializeManagementRoutes(managementLogsService) {
  /**
   * GET /api/management/logs
   * Fetch processed logs from Firebase management collection
   * Query params: ?date=2025-10-07 (optional)
   */
  router.get('/logs', async (req, res) => {
    try {
      const date = req.query.date;
      
      if (date) {
        console.log(`📥 GET /api/management/logs?date=${date} - Fetching logs for specific date...`);
      } else {
        console.log('📥 GET /api/management/logs - Fetching all logs from Firebase...');
      }
      
      const managementData = await managementLogsService.getLogsFromFirebase(date);
      
      if (!managementData) {
        return res.status(404).json({
          success: false,
          message: date ? `No logs found for date ${date}` : 'No management logs found. Try refreshing first.'
        });
      }

      res.json({
        success: true,
        data: managementData,
        dates: Object.keys(managementData),
        totalDates: Object.keys(managementData).length
      });
    } catch (error) {
      console.error('❌ Error fetching management logs:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/management/logs/dates
   * Get list of available dates
   */
  router.get('/logs/dates', async (req, res) => {
    try {
      console.log('📅 GET /api/management/logs/dates - Fetching available dates...');
      
      const managementData = await managementLogsService.getLogsFromFirebase();
      
      if (!managementData) {
        return res.status(404).json({
          success: false,
          message: 'No management logs found. Try refreshing first.'
        });
      }

      const dates = Object.keys(managementData);
      
      res.json({
        success: true,
        dates: dates,
        totalDates: dates.length
      });
    } catch (error) {
      console.error('❌ Error fetching dates:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/management/refresh
   * Force refresh logs from EasyTime Pro API
   */
  router.post('/refresh', async (req, res) => {
    try {
      console.log('🔄 POST /api/management/refresh - Forcing log refresh...');
      
      const limit = parseInt(req.body.limit || req.query.limit || '50000');
      
      if (limit < 1 || limit > 50000) {
        return res.status(400).json({
          success: false,
          message: 'Limit must be between 1 and 50000'
        });
      }

      const result = await managementLogsService.fetchAndProcessTransactions(limit);
      
      if (!result.success) {
        return res.status(409).json(result);
      }

      res.json({
        success: true,
        message: 'Logs refreshed successfully',
        data: result.data
      });
    } catch (error) {
      console.error('❌ Error refreshing logs:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/management/status
   * Get current processing status
   */
  router.get('/status', async (req, res) => {
    try {
      const status = managementLogsService.getStatus();
      
      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('❌ Error getting status:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/zkteco/transactions
   * Fetch raw transactions from EasyTime Pro API
   */
  router.get('/transactions', async (req, res) => {
    try {
      console.log('📊 GET /api/zkteco/transactions - Fetching raw transactions...');
      
      const limit = Math.min(parseInt(req.query.limit || '50000'), 50000);
      
      const transactions = await managementLogsService.fetchTransactions(limit);
      
      res.json({
        success: true,
        count: transactions.length,
        data: transactions
      });
    } catch (error) {
      console.error('❌ Error fetching transactions:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = initializeManagementRoutes;

