# Management Logs API Documentation

## 📋 Overview

The Management Logs API fetches attendance transactions from EasyTime Pro and processes them into categorized logs for the Management page. The system automatically refreshes data every 5 minutes and stores processed logs in Firebase.

---

## 🚀 Quick Start

### Start the Server
```bash
npm start
```

The server will:
1. Connect to Firebase and EasyTime Pro
2. Start monitoring Firebase collections
3. Begin auto-refresh for management logs (every 5 minutes)
4. Run on `http://localhost:3002`

---

## 📊 API Endpoints

### 1. **Get All Management Logs**
```http
GET /api/management/logs
```

**Response:**
```json
{
  "success": true,
  "data": {
    "allLogs": [...],
    "staffLogs": [...],
    "dayscholarLogs": [...],
    "outingLogs": [...],
    "homeVisitLogs": [...],
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "totalTransactionsProcessed": 1500
  }
}
```

---

### 2. **Get Specific Log Type**
```http
GET /api/management/logs/:type
```

**Parameters:**
- `type`: `staff`, `dayscholar`, `outing`, `homevisit`, or `all`

**Example:**
```bash
curl http://localhost:3002/api/management/logs/staff
```

**Response:**
```json
{
  "success": true,
  "type": "staff",
  "data": [
    {
      "id": "001",
      "name": "John Doe",
      "department": "CSE",
      "in": "2024-01-15T09:00:00Z",
      "out": "2024-01-15T17:00:00Z",
      "status": "Outside",
      "timestamp": "2024-01-15T09:00:00Z",
      "type": "staff"
    }
  ],
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

---

### 3. **Force Refresh Logs**
```http
POST /api/management/refresh
```

**Body (optional):**
```json
{
  "limit": 50000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Logs refreshed successfully",
  "data": {
    "allLogs": [...],
    "staffLogs": [...],
    "dayscholarLogs": [...],
    "outingLogs": [...],
    "homeVisitLogs": [...],
    "lastUpdated": "2024-01-15T10:35:00.000Z"
  }
}
```

---

### 4. **Get Processing Status**
```http
GET /api/management/status
```

**Response:**
```json
{
  "success": true,
  "status": {
    "isProcessing": false,
    "lastUpdateTime": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 5. **Get Raw Transactions**
```http
GET /api/zkteco/transactions?limit=1000
```

**Query Parameters:**
- `limit`: Number of transactions (max: 50000, default: 50000)

**Response:**
```json
{
  "success": true,
  "count": 1000,
  "data": [
    {
      "emp_code": "001",
      "punch_time": "2024-01-15T09:00:00Z",
      "punch_state": "0",
      "verify_type": "1"
    }
  ]
}
```

---

## 🔄 Processing Logic

### Staff Logs
- **Source:** Firebase `staff` collection
- **Logic:** 
  - First punch = IN
  - Second punch = OUT
  - Status: "Inside" or "Outside"

### Dayscholar Logs
- **Source:** Firebase `students` collection (position = "DAYSCHOLAR")
- **Logic:**
  - First punch = IN
  - Second punch = OUT
  - Status: "Inside" or "Outside"

### Outing Logs (Hosteller)
- **Source:** Firebase `students` collection (position = "HOSTELLER")
- **Requires:** Approved pass request with `type: "outing"`
- **Logic:**
  - First punch = OUT
  - Second punch = IN
  - Status: "Outside" or "Inside"

### Home Visit Logs (Hosteller)
- **Source:** Firebase `students` collection (position = "HOSTELLER")
- **Requires:** Approved pass request with `type: "home_visit"`
- **Logic:**
  - First punch = OUT
  - Second punch = IN
  - Status: "Outside" or "Inside"

---

## 🔍 Data Structure

### Firebase Collections Used

#### `staff` Collection
```json
{
  "001": {
    "username": "001",
    "name": "John Doe",
    "department": "CSE",
    "position": "Professor"
  }
}
```

#### `students` Collection (Nested by Department)
```json
{
  "CSE": {
    "12345": {
      "emp_code": "12345",
      "first_name": "Alice",
      "department": "CSE",
      "position": "DAYSCHOLAR",
      "easyTimeProId": "67890"
    }
  },
  "ECE": {
    "12346": {
      "emp_code": "12346",
      "first_name": "Bob",
      "department": "ECE",
      "position": "HOSTELLER",
      "easyTimeProId": "67891"
    }
  }
}
```

#### `passRequests` Collection
```json
{
  "12346": {
    "request1": {
      "type": "outing",
      "wardenApprovedBy": "warden001",
      "status": "warden_approved",
      "createdAt": "2024-01-15T09:00:00Z",
      "expiresAt": "2024-01-15T18:00:00Z"
    }
  }
}
```

#### `management` Collection (Output)
```json
{
  "allLogs": [...],
  "staffLogs": [...],
  "dayscholarLogs": [...],
  "outingLogs": [...],
  "homeVisitLogs": [...],
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "totalTransactionsProcessed": 1500
}
```

---

## ⚙️ Configuration

### Environment Variables (`.env`)
```env
# EasyTime Pro API
EASYTIME_BASE_URL=http://127.0.0.1:8081
EASYTIME_USERNAME=admin
EASYTIME_PASSWORD=Admin@123

# Server Configuration
PORT=3002

# Firebase Configuration (in firebaseConfig.js)
```

### Auto-Refresh Interval
By default, logs refresh every **5 minutes**. To change this, modify the `AUTO_REFRESH_INTERVAL` in `server.js`:

```javascript
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
```

---

## 🧪 Testing

### 1. Test Server Health
```bash
curl http://localhost:3002/health
```

### 2. Test EasyTime Pro Connection
```bash
curl http://localhost:3002/test/easytime
```

### 3. Test Firebase Connection
```bash
curl http://localhost:3002/test/firebase
```

### 4. Force Refresh Logs
```bash
curl -X POST http://localhost:3002/api/management/refresh
```

### 5. Get All Logs
```bash
curl http://localhost:3002/api/management/logs
```

### 6. Get Staff Logs Only
```bash
curl http://localhost:3002/api/management/logs/staff
```

### 7. Get Processing Status
```bash
curl http://localhost:3002/api/management/status
```

---

## 🔧 Troubleshooting

### Issue: No logs found
**Solution:** Run a manual refresh first:
```bash
curl -X POST http://localhost:3002/api/management/refresh
```

### Issue: EasyTime Pro authentication failed
**Solution:** 
1. Check if EasyTime Pro is running on `http://127.0.0.1:8081`
2. Verify credentials in `.env` file
3. Test authentication: `curl http://localhost:3002/test/easytime`

### Issue: Firebase permission denied
**Solution:** 
1. Update Firebase rules to include `management` collection
2. Apply the rules from `firebase-rules.json`

### Issue: Auto-refresh not working
**Solution:**
1. Check server logs for errors
2. Verify EasyTime Pro connectivity
3. Check processing status: `curl http://localhost:3002/api/management/status`

---

## 📝 Firebase Rules

Add to Firebase Realtime Database Rules:

```json
{
  "rules": {
    "management": {
      ".write": true,
      ".read": true
    },
    "staff": {
      ".write": true,
      ".read": true
    },
    "students": {
      ".write": true,
      ".read": true,
      "$department": {
        ".write": true,
        ".read": true
      }
    },
    "passRequests": {
      ".write": true,
      ".read": true
    }
  }
}
```

---

## 🎯 Frontend Integration Example

### React/Next.js Example
```javascript
// Fetch all management logs
const fetchManagementLogs = async () => {
  try {
    const response = await fetch('http://localhost:3002/api/management/logs');
    const data = await response.json();
    
    if (data.success) {
      console.log('All logs:', data.data.allLogs);
      console.log('Staff logs:', data.data.staffLogs);
      console.log('Dayscholar logs:', data.data.dayscholarLogs);
      console.log('Outing logs:', data.data.outingLogs);
      console.log('Home visit logs:', data.data.homeVisitLogs);
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
  }
};

// Force refresh logs
const refreshLogs = async () => {
  try {
    const response = await fetch('http://localhost:3002/api/management/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    console.log('Refresh result:', data);
  } catch (error) {
    console.error('Error refreshing logs:', error);
  }
};
```

---

## 🚀 Performance

- **Auto-refresh interval:** 5 minutes
- **Max transactions per fetch:** 50,000
- **Processing time:** ~2-5 seconds for 10,000 transactions
- **Firebase read operations:** 3 per refresh (staff, students, passRequests)
- **Firebase write operations:** 1 per refresh (management collection)

---

## 📦 Dependencies

- `express` - Web server framework
- `axios` - HTTP client for EasyTime Pro API
- `firebase` - Firebase SDK
- `cors` - CORS middleware
- `dotenv` - Environment variables

---

## ✅ Complete Flow

```
1. Server starts
   ↓
2. Connect to Firebase & EasyTime Pro
   ↓
3. Start auto-refresh (every 5 minutes)
   ↓
4. Fetch transactions from EasyTime Pro
   ↓
5. Load Firebase data (staff, students, passRequests)
   ↓
6. Process & categorize transactions
   ↓
7. Save processed logs to Firebase management collection
   ↓
8. Frontend fetches logs from Firebase
```

---

## 🎉 Success!

The Management Logs API is now ready to power your Management page with real-time, categorized attendance logs!

For support, check server logs or contact the development team.

