const axios = require('axios');

class EasyTimeProService {
  constructor() {
    this.baseURL = process.env.EASYTIMEPRO_API_URL || 'http://127.0.0.1:8081';
    this.username = process.env.EASYTIMEPRO_USERNAME || 'admin';
    this.password = process.env.EASYTIMEPRO_PASSWORD || 'Admin@123';
    this.token = null;
    this.isAuthenticated = false;
  }

  /**
   * Authenticate with EasyTime Pro API
   * @returns {Promise<boolean>} Authentication success status
   */
  async authenticate() {
    try {
      console.log('🔐 Authenticating with EasyTime Pro...');
      
      const response = await axios.post(`${this.baseURL}/api-token-auth/`, {
        username: this.username,
        password: this.password
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.token) {
        this.token = response.data.token;
        this.isAuthenticated = true;
        console.log('✅ EasyTime Pro authentication successful');
        return true;
      } else {
        console.error('❌ EasyTime Pro authentication failed: No token received');
        return false;
      }
    } catch (error) {
      console.error('❌ EasyTime Pro authentication failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers with authorization token
   */
  getAuthHeaders() {
    if (!this.token) {
      throw new Error('Not authenticated. Please authenticate first.');
    }
    return {
      'Authorization': `Token ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Add new staff member to EasyTime Pro
   * @param {Object} staffData - Staff member data
   * @returns {Promise<Object>} API response
   */
  async addStaffMember(staffData) {
    try {
      console.log('👤 Adding staff member to EasyTime Pro:', staffData.emp_code);
      
      if (!this.isAuthenticated) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
      }

      const response = await axios.post(
        `${this.baseURL}/personnel/api/employees/`,
        staffData,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000
        }
      );

      console.log('✅ Staff member added successfully:', response.data);
      return {
        success: true,
        data: response.data,
        message: 'Staff member added successfully'
      };
    } catch (error) {
      console.error('❌ Failed to add staff member:', error.message);
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Delete staff member from EasyTime Pro
   * @param {string} id - Staff member ID
   * @returns {Promise<Object>} API response
   */
  async deleteStaffMember(id) {
    try {
      console.log('🗑️ Deleting staff member from EasyTime Pro:', id);
      
      if (!this.isAuthenticated) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
      }

      const response = await axios.delete(
        `${this.baseURL}/personnel/api/employees/${id}/`,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000
        }
      );

      console.log('✅ Staff member deleted successfully');
      return {
        success: true,
        data: response.data,
        message: 'Staff member deleted successfully'
      };
    } catch (error) {
      console.error('❌ Failed to delete staff member:', error.message);
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Update staff member in EasyTime Pro
   * @param {string} id - Staff member ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} API response
   */
  async updateStaffMember(id, updateData) {
    try {
      console.log('✏️ Updating staff member in EasyTime Pro:', id);
      
      if (!this.isAuthenticated) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
      }

      const response = await axios.patch(
        `${this.baseURL}/personnel/api/employees/${id}/`,
        updateData,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000
        }
      );

      console.log('✅ Staff member updated successfully');
      return {
        success: true,
        data: response.data,
        message: 'Staff member updated successfully'
      };
    } catch (error) {
      console.error('❌ Failed to update staff member:', error.message);
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Get all staff members from EasyTime Pro
   * @returns {Promise<Object>} API response
   */
  async getStaffMembers() {
    try {
      console.log('📋 Fetching staff members from EasyTime Pro...');
      
      if (!this.isAuthenticated) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
      }

      const response = await axios.get(
        `${this.baseURL}/personnel/api/employees/`,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000
        }
      );

      console.log('✅ Staff members fetched successfully');
      return {
        success: true,
        data: response.data,
        message: 'Staff members fetched successfully'
      };
    } catch (error) {
      console.error('❌ Failed to fetch staff members:', error.message);
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Get transaction logs from EasyTime Pro
   * @param {number} limit - Number of records to fetch
   * @returns {Promise<Object>} API response
   */
  async getTransactionLogs(limit = 100) {
    try {
      console.log('📊 Fetching transaction logs from EasyTime Pro...');
      
      if (!this.isAuthenticated) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
      }

      const response = await axios.get(
        `${this.baseURL}/iclock/api/transactions/`,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000,
          params: { limit }
        }
      );

      console.log('✅ Transaction logs fetched successfully');
      return {
        success: true,
        data: response.data,
        message: 'Transaction logs fetched successfully'
      };
    } catch (error) {
      console.error('❌ Failed to fetch transaction logs:', error.message);
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Change area for employees in EasyTime Pro
   * @param {Array} employees - Array of easyTimeProIds
   * @param {Array} areas - Array of area IDs
   * @returns {Promise<Object>} API response
   */
  async changeEmployeeArea(employees, areas) {
    try {
      console.log(`🔄 Changing area for employees: ${employees.join(', ')} to areas: ${areas.join(', ')}...`);
      
      if (!this.isAuthenticated) {
        const authSuccess = await this.authenticate();
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
      }

      const requestBody = {
        employees: employees,
        areas: areas
      };

      const response = await axios.post(
        `${this.baseURL}/personnel/api/employees/adjust_area/`,
        requestBody,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000
        }
      );

      console.log(`✅ Area change successful for employees: ${employees.join(', ')}`);
      return {
        success: true,
        data: response.data,
        message: 'Area changed successfully'
      };
    } catch (error) {
      console.error('❌ Failed to change employee area:', error.message);
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Check if service is authenticated
   * @returns {boolean} Authentication status
   */
  isServiceAuthenticated() {
    return this.isAuthenticated && this.token !== null;
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getServiceStatus() {
    return {
      isAuthenticated: this.isAuthenticated,
      hasToken: this.token !== null,
      baseURL: this.baseURL,
      username: this.username
    };
  }
}

module.exports = EasyTimeProService;
