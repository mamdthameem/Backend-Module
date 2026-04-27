# How to Update Windows Service After Code Changes

## Quick Restart (Recommended)

### Option 1: Using the Batch Script (Easiest)
1. **Right-click** on `restart_service.bat`
2. Select **"Run as administrator"**
3. The script will automatically stop and restart the service

### Option 2: Manual Restart via Command Prompt
1. Open **Command Prompt as Administrator**
2. Run these commands:
   ```cmd
   net stop "SSEC-Backend-Service"
   timeout /t 3
   net start "SSEC-Backend-Service"
   ```

### Option 3: Using Windows Services Manager
1. Press `Win + R`, type `services.msc`, press Enter
2. Find **"SSEC-Backend-Service"**
3. Right-click → **Stop**
4. Wait 3-5 seconds
5. Right-click → **Start**

## Verify Service is Running

After restarting, check the logs to verify:

1. **Check service logs:**
   - `daemon\ssecbackendservice.out.log` - Service output
   - `daemon\ssecbackendservice.err.log` - Service errors
   - `backend.log` - Application logs

2. **Look for these messages in the logs:**
   ```
   ✅ Pass Request monitoring started
   🔄 Starting ToHO scheduled monitor (runs every hour)...
   ```

3. **Test the service:**
   - Open browser: `http://localhost:3002/health`
   - Should return: `{"status":"healthy",...}`

## Troubleshooting

### Service Won't Start
1. Check `daemon\ssecbackendservice.err.log` for errors
2. Verify Node.js is installed: `node --version`
3. Check if port 3002 is already in use
4. Verify `.env` file exists and has correct configuration

### Code Changes Not Reflected
1. **Ensure service is restarted** (most common issue)
2. Check that files are saved in `D:\Backend Module\`
3. Verify the service is pointing to correct directory (check `daemon\ssecbackendservice.xml`)
4. Check `backend.log` for any startup errors

### ToHO Collection Still Empty
1. **Restart the service** to load new code
2. Check `backend.log` for ToHO save messages:
   ```
   💾 Attempting to save to ToHO collection: ...
   ✅ Successfully saved and verified ToHO collection: ...
   ```
3. Verify pass requests have `status: "warden_approved"` and `type: "outing"` or `"home_visit"`
4. Check Firebase console to verify data structure

## Important Notes

- **The service must be restarted** after any code changes
- The service runs from: `D:\Backend Module\server.js`
- Logs are in: `D:\Backend Module\backend.log` and `daemon\` folder
- Date format in ToHO: `YYYY-MM-DD` (e.g., `2025-12-15`, not `15/12/25`)

## Service Installation/Reinstallation

If you need to reinstall the service:

1. **Uninstall:**
   ```cmd
   node uninstall_service.js
   ```

2. **Install:**
   ```cmd
   node install_service.js
   ```

3. **Start:**
   ```cmd
   net start "SSEC-Backend-Service"
   ```

