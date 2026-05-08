# SSEC Backend Service

A Node.js bridge that runs as a Windows service, connecting the **EasyTime Pro biometric device** to **Firebase Realtime Database**. It listens for changes in Firebase and syncs them to the biometric system, and periodically pulls today's attendance transactions back into Firebase.

---

## What It Does

### 1. Staff & Student Management

Monitors Firebase for add/edit/remove operations and calls the EasyTime Pro API accordingly.


| Firebase Collection                             | Action                               |
| ----------------------------------------------- | ------------------------------------ |
| `staff_management/Adding Staff/{empCode}`       | Add staff to EasyTime Pro            |
| `staff_management/Removing Staff/{empCode}`     | Remove staff from EasyTime Pro       |
| `student_management/Adding Student/{empCode}`   | Add student to EasyTime Pro          |
| `student_management/Removing Student/{empCode}` | Remove student from EasyTime Pro     |
| `staff_details/{empCode}`                       | Edit staff details in EasyTime Pro   |
| `student_details/{empCode}`                     | Edit student details in EasyTime Pro |


Each record uses `status: "pending"` to trigger processing. The service updates it to `"processing"` → `"completed"` or `"failed"`.

---

### 2. Pass Requests → ToHO (Area Change to 2)

When a warden approves a student pass request (`status: "warden_approved"`), the service:

1. Finds the student's `easyTimeProId` in the `students` collection
2. Saves the entry to `ToHO/{date}/{empCode}` with `{ employees, areas: [2], type, createdAt }`
3. Calls EasyTime Pro API to move the student to **Area 2 (Hostel Out)**
4. Updates the pass request status to `"area_changed"` in Firebase (prevents re-processing on restart)

---

### 3. ToNA → Return to Campus (Area Change to 3)

When something writes to the `ToNA` collection with an `employees` array, the service:

1. Finds all unprocessed entries (no `processedAt` timestamp)
2. Calls EasyTime Pro API to move each employee to **Area 3 (NA / back inside)**, one by one
3. Saves per-employee results and marks `processedAt` to prevent re-processing

---

### 4. Attendance Logs (Auto-Refresh Every 5 Minutes)

Fetches today's punch transactions from EasyTime Pro and saves them to `management/{date}/{empCode}` in Firebase.

- Only today's transactions are fetched (not historical)
- Merges with existing data — preserves any `type` or `savedAt` already saved
- The management collection is the sole output of this job; pass requests do not write to it

---

## Configuration

### `.env`

```
EASYTIMEPRO_API_URL=http://127.0.0.1:8081
EASYTIMEPRO_USERNAME=admin
EASYTIMEPRO_PASSWORD=Admin@123
PORT=3002
NODE_ENV=production
```

### `firebaseConfig.js`

Update with your Firebase project credentials.

---

## Firebase Data Structure

```
staff_management/
  Adding Staff/{empCode}/   status, data
  Removing Staff/{empCode}/ status, data

student_management/
  Adding Student/{empCode}/ status, data
  Removing Student/{empCode}/ status, data

staff_details/{empCode}/    status, easyTimeProId, ...fields
student_details/{empCode}/  status, easyTimeProId, ...fields

staff/{empCode}/
  easyTimeProId

students/{department}/{empCode}/
  easyTimeProId, emp_code, first_name, ...

passRequests/{empCode}/{requestId}/
  status, type, wardenApprovedBy, createdAt

ToHO/{date}/{empCode}/
  employees[], areas[], type, createdAt

ToNA/{date}/{empCode}/
  employees[], processedAt, results/{employeeId}

management/{date}/{empCode}/
  emp_code, name, department, position, transactions[]
```

---

## Running the Service

### Development

```cmd
npm run dev
```

### Production (Windows Service)

**Install:**

```cmd
node install_service.js
```

**Start / Stop / Restart:**

```cmd
net start "SSEC-Backend-Service"
net stop "SSEC-Backend-Service"
```

Or right-click `restart_service.bat` → Run as administrator.

**Reinstall after code changes:**

```cmd
node uninstall_service.js
node install_service.js
net start "SSEC-Backend-Service"
```

**Check if running:**

```
http://localhost:3002/health
```

---

## API Endpoints


| Method | Path                                   | Description                                 |
| ------ | -------------------------------------- | ------------------------------------------- |
| GET    | `/health`                              | Health check                                |
| GET    | `/status`                              | Firebase + EasyTime Pro connectivity status |
| GET    | `/test/easytime`                       | Test EasyTime Pro auth                      |
| GET    | `/test/firebase`                       | Test Firebase connection                    |
| POST   | `/monitoring/start`                    | Start Firebase listeners                    |
| POST   | `/monitoring/stop`                     | Stop Firebase listeners                     |
| GET    | `/api/management/logs`                 | Get today's management logs from Firebase   |
| GET    | `/api/management/logs?date=YYYY-MM-DD` | Get logs for a specific date                |
| POST   | `/api/management/refresh`              | Force-refresh today's transactions now      |
| GET    | `/api/management/status`               | Check if a refresh is currently running     |


---

## Logs

- `**backend.log**` — application output, rotates at 10 MB → `backend.log.old`
- `**daemon/ssecbackendservice.err.log**` — Windows service errors
- `**daemon/ssecbackendservice.out.log**` — Windows service stdout

---

## Troubleshooting

**Service won't start**

- Check `daemon/ssecbackendservice.err.log`
- Verify `.env` exists and has correct values
- Confirm Node.js is installed: `node --version`
- Confirm port 3002 is free

**Students not moving to ToHO**

- Confirm pass request has `status: "warden_approved"` and a `type` field (`"outing"` or `"home_visit"`)
- Confirm the student exists in `students/{department}/{empCode}` and has an `easyTimeProId`
- Check `backend.log` for `Found student` or `No easyTimeProId found` messages
- If `easyTimeProId` is missing, the student must be re-added through the management flow

**Code changes not reflected**

- The service must be restarted after any file change: `restart_service.bat`

