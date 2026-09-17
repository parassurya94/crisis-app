require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json()); // CRITICAL: Allows Express to read JSON body data

// --- DATABASE SETUP ---
// In production, this uses the Render environment variable. Locally, it uses a .env file.
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// --- REST APIs FOR AUTH ---
app.post('/signup', async (req, res) => {
  try {
    const { name, password, role } = req.body;
    const existingUser = await User.findOne({ name });
    if (existingUser) return res.status(400).json({ error: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, password: hashedPassword, role });
    await newUser.save();

    res.json({ name: newUser.name, role: newUser.role });
  } catch (err) {
    res.status(500).json({ error: "Server error during signup" });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { name, password, role } = req.body;
    const user = await User.findOne({ name, role });
    if (!user) return res.status(400).json({ error: "User not found or role mismatch" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid password" });

    res.json({ name: user.name, role: user.role });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
});

app.get('/', (req, res) => res.send("Rescue Backend is LIVE with DB Auth!"));

// --- WEBSOCKETS ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
let activePins = {}; 

io.on('connection', (socket) => {
  socket.emit('initial_pins', activePins);

  socket.on('need_help', (data) => {
    activePins[data.id] = data;
    socket.broadcast.emit('new_pin', data); 
  });

  socket.on('claim_rescue', (data) => {
    if(activePins[data.id]) {
      activePins[data.id].status = 'claimed';
      activePins[data.id].rescuerName = data.volunteerName;
      io.emit('pin_updated', activePins[data.id]); 
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));