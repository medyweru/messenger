const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// rooms[code] = { creatorId, creatorSocketId }
const rooms = {};

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('create-room', () => {
    // Clean up any previous rooms this socket owned
    for (const [code, room] of Object.entries(rooms)) {
      if (room.creatorSocketId === socket.id) {
        delete rooms[code];
      }
    }

    let code;
    do {
      code = generateCode();
    } while (rooms[code]);

    rooms[code] = { creatorSocketId: socket.id };
    socket.join(code);
    socket.roomCode = code;

    socket.emit('room-created', { code });
    console.log(`Room created: ${code} by ${socket.id}`);
  });

  socket.on('join-room', ({ code }) => {
    const room = rooms[code];

    if (!room) {
      socket.emit('error-message', { message: `Комната с кодом ${code} не найдена. Проверьте код и попробуйте снова.` });
      return;
    }

    socket.join(code);
    socket.roomCode = code;
    socket.isGuest = true;
    room.guestSocketId = socket.id;

    // Notify creator
    io.to(room.creatorSocketId).emit('user-joined', { guestId: socket.id });
    console.log(`Guest ${socket.id} joined room ${code}`);
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id);
    const code = socket.roomCode;
    if (code && rooms[code]) {
      // Notify the other peer
      socket.to(code).emit('peer-disconnected');
      delete rooms[code];
      console.log(`Room ${code} deleted`);
    }
  });
});

app.get('/', (req, res) => res.send('Signaling server is running.'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
