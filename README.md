# EasyTime Pro Bridge Backend

A Node.js backend service that acts as a bridge between Firebase Realtime Database and EasyTime Pro API. This service monitors Firebase collections in real-time and automatically processes EasyTime Pro API calls based on the data stored in Firebase.

## 🚀 Features

- **Real-time Monitoring**: Automatically detects changes in Firebase collections
- **Automatic Processing**: Processes pending operations without manual intervention
- **Status Updates**: Updates Firebase with operation results
- **Error Recovery**: Handles failures gracefully and logs errors
- **Service Health**: Provides health check endpoints
- **Graceful Shutdown**: Properly stops monitoring on server shutdown

## 📁 Project Structure

```
easytime-pro-bridge/
├── server.js                 # Main server file
├── package.json             # Dependencies
├── env.example              # Environment variables template
├── firebaseConfig.js        # Firebase configuration
├── services/
│   ├── easytimeService.js   # EasyTime Pro API service
│   └── firebaseMonitor.js   # Firebase monitoring service
└── README.md               # Documentation
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase project with Realtime Database
- EasyTime Pro API access

### Installation

1. **Clone or download the project**
   ```bash
   # If you have the project files, navigate to the directory
   cd easytime-pro-bridge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   # Copy the example environment file
   cp env.example .env
   
   # Edit .env file with your configuration
   # Update the values as needed
   ```

4. **Configure Firebase**
   - Update `firebaseConfig.js` with your Firebase project configuration
   - Ensure your Firebase project has Realtime Database enabled

5. **Start the service**
   ```bash
   # For development
   npm run dev
   
   # For production
   npm start
   ```

## 🔧 Configuration

### Environment Variables (.env)

```env
# EasyTime Pro API Configuration
EASYTIMEPRO_API_URL=http://127.0.0.1:8081
EASYTIMEPRO_USERNAME=admin
EASYTIMEPRO_PASSWORD=Admin@123

# Server Configuration
PORT=3002
NODE_ENV=development
```

### Firebase Configuration

Update `firebaseConfig.js` with your Firebase project details:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.region.firebasedatabase.app",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## 📊 Data Flow Architecture

```
Frontend (React) 
    ↓ (API calls)
NEW_BACKEND (Port 3001) 
    ↓ (saves to Firebase)
Firebase Realtime Database
    ↓ (real-time monitoring)
EasyTime Pro Bridge (Port 3002)
    ↓ (API calls)
EasyTime Pro API (Port 8081)
```

## 🔥 Firebase Collections Structure

### Staff Management
```
staff_management/
├── Adding Staff/
│   └── {emp_code}/
│       ├── status: "pending" | "completed" | "failed"
│       └── data: { emp_code, first_name, department, position, area, ... }
└── Removing Staff/
    └── {emp_code}/
        ├── status: "pending" | "completed" | "failed"
        └── data: { staff_id, easyTimeProId }
```

### Student Management
```
student_management/
├── Adding Student/
│   └── {emp_code}/
│       ├── status: "pending" | "completed" | "failed"
│       └── data: { emp_code, first_name, department, position, area, ... }
└── Removing Student/
    └── {emp_code}/
        ├── status: "pending" | "completed" | "failed"
        └── data: { staff_id, easyTimeProId }
```

## 🌐 API Endpoints

### Health & Status
- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint
- `GET /status` - Service status (Firebase + EasyTime Pro connectivity)

### Testing
- `GET /test/easytime` - Test EasyTime Pro connection
- `GET /test/firebase` - Test Firebase connection
- `POST /test/save-easytime-id` - Test saving EasyTime Pro ID to staff collection
- `POST /test/save-easytime-id-student` - Test saving EasyTime Pro ID to student's department collection (requires departmentId)
- `POST /test/edit-staff` - Test editing staff in EasyTime Pro (requires easyTimeProId and updatedData)
- `POST /test/edit-student` - Test editing student in EasyTime Pro (requires easyTimeProId and updatedData)

### Monitoring Control
- `POST /monitoring/start` - Start Firebase monitoring
- `POST /monitoring/stop` - Stop Firebase monitoring

## 🔍 Monitoring Collections

The service monitors the following Firebase collections:

### Staff Management
- `staff_management/Adding Staff/{emp_code}` - Process new staff additions
- `staff_management/Removing Staff/{emp_code}` - Process staff removals

### Student Management
- `student_management/Adding Student/{emp_code}` - Process new student additions
- `student_management/Removing Student/{emp_code}` - Process student removals

## ⚙️ EasyTime Pro API Integration

### Authentication
- **Endpoint**: `POST /api-token-auth/`
- **Method**: Token-based authentication
- **Headers**: `Authorization: Token {token}`

### Staff Management
- **Add Staff**: `POST /personnel/api/employees/`
- **Delete Staff**: `DELETE /personnel/api/employees/{id}/`
- **Update Staff**: `PATCH /personnel/api/employees/{id}/`
- **Get Staff**: `GET /personnel/api/employees/`

### Transaction Logs
- **Get Logs**: `GET /iclock/api/transactions/`

## 📝 Status Updates

The service automatically updates Firebase with operation results:

- **Success**: `status: "completed"`
- **Failure**: `status: "failed"`
- **Pending**: `status: "pending"` (initial state)

## 🚨 Error Handling & Logging

### Logging Features
- Authentication success/failure
- API call results (success/failure)
- Firebase monitoring status
- Error details with stack traces
- Status updates in Firebase

### Error Handling
- Network timeouts
- Authentication failures
- API rate limiting
- Firebase connection issues
- Graceful degradation

## 🏥 Health Checks

### Health Check Endpoint
```bash
curl http://localhost:3002/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "service": "EasyTime Pro Bridge"
}
```

### Status Endpoint
```bash
curl http://localhost:3002/status
```

**Response:**
```json
{
  "service": "EasyTime Pro Bridge",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "status": {
    "server": "running",
    "firebase": "connected",
    "easyTimePro": "authenticated",
    "monitoring": "active"
  },
  "details": {
    "firebase": {
      "connected": true,
      "activeListeners": 4,
      "listenerPaths": [
        "staff_management/Adding Staff",
        "staff_management/Removing Staff",
        "student_management/Adding Student",
        "student_management/Removing Student"
      ]
    },
    "easyTimePro": {
      "isAuthenticated": true,
      "hasToken": true,
      "baseURL": "http://127.0.0.1:8081",
      "username": "admin"
    },
    "monitoring": {
      "isMonitoring": true,
      "activeListeners": 4
    }
  }
}
```

## 🔄 Expected Behavior

1. **Startup**: Server starts, authenticates with EasyTime Pro, begins Firebase monitoring
2. **Monitoring**: Listens for changes in Firebase collections
3. **Processing**: When new data appears with `status: "pending"`, processes it via EasyTime Pro API
4. **Status Update**: Updates Firebase with `status: "completed"` or `status: "failed"`
5. **Logging**: Logs all operations and results
6. **Shutdown**: Stops monitoring and closes connections gracefully

## 🛡️ Security Considerations

- Store sensitive credentials in environment variables
- Use HTTPS in production
- Implement proper authentication for API endpoints
- Monitor and log all API interactions
- Implement rate limiting for external API calls

## 🚀 Production Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Use a process manager like PM2
3. Configure proper logging
4. Set up monitoring and alerting
5. Use HTTPS certificates

### PM2 Configuration
```json
{
  "apps": [{
    "name": "easytime-pro-bridge",
    "script": "server.js",
    "instances": 1,
    "exec_mode": "fork",
    "env": {
      "NODE_ENV": "production",
      "PORT": 3002
    }
  }]
}
```

## 📞 Support

For issues and questions:
1. Check the logs for error messages
2. Verify Firebase and EasyTime Pro connectivity
3. Test individual endpoints
4. Check environment configuration

## 📄 License

This project is part of the EasyTime Pro integration system.
