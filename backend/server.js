const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Initialize Socket.io to talk to our React app
const io = new Server(server, {
  cors: {
    origin: "*", // CHANGED: Allows connections from your live Vercel frontend
    methods: ["GET", "POST"]
  }
});

let activePins = {}; // Temporary database

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);
  
  // Send existing pins to newly connected users
  socket.emit('initial_pins', activePins);

  // Listen for someone pressing "Need Help"
  socket.on('need_help', (data) => {
    activePins[data.id] = data;
    socket.broadcast.emit('new_pin', data); // Broadcast to everyone else
  });

  // Listen for a volunteer claiming a pin
  socket.on('claim_rescue', (id) => {
    if(activePins[id]) {
      activePins[id].status = 'claimed';
      io.emit('pin_updated', activePins[id]); // Update everyone
    }
  });
});

// CHANGED: Use the cloud provider's assigned port, or default to 3001 locally
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend Server is running on port ${PORT}`);
});