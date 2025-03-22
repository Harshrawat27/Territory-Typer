// Add this to the top of your server.js file
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const games = {};
const waitingGames = [];

// Debug logging helper
function logDebug(message, data = null) {
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
}

// Create initial territories data
function createTerritories() {
  return [
    {
      id: 'north-america',
      name: 'North America',
      phrase:
        'North America is a diverse continent with vast landscapes, from the Arctic tundra of Canada to the tropical beaches of the Caribbean. It is home to the United States, Canada, and Mexico, along with several smaller nations. The continent is known for its economic power, cultural influence, and natural wonders like the Grand Canyon.',
      owner: null,
      x: 180,
      y: 150,
    },
    {
      id: 'south-america',
      name: 'South America',
      phrase:
        'South America is rich in biodiversity, featuring the Amazon Rainforest, the Andes Mountains, and unique wildlife. It consists of countries like Brazil, Argentina, and Colombia, each with distinct cultures and traditions. Known for football passion, vibrant festivals, and ancient civilizations like the Inca, it has a deep historical heritage.',
      owner: null,
      x: 220,
      y: 290,
    },
    {
      id: 'europe',
      name: 'Europe',
      phrase:
        'Europe blends history and modernity, featuring iconic landmarks such as the Eiffel Tower, Colosseum, and Buckingham Palace. Comprising nations like France, Germany, and Spain, it has a rich cultural heritage, diverse languages, and economic strength. The continent has influenced global politics, art, and science for centuries.',
      owner: null,
      x: 450,
      y: 130,
    },
    {
      id: 'africa',
      name: 'Africa',
      phrase:
        'Africa is the second-largest continent, known for its diverse cultures, wildlife, and landscapes. From the Sahara Desert to the Serengeti, it holds vast natural beauty. It is home to over 50 nations, including Nigeria, Egypt, and South Africa. Rich in history, Africa has ancient civilizations like Egypt and a strong cultural heritage.',
      owner: null,
      x: 450,
      y: 250,
    },
    {
      id: 'asia',
      name: 'Asia',
      phrase:
        "Asia, the largest continent, is home to over four billion people and some of the world's oldest civilizations, including China and India. It has diverse landscapes, from the Himalayas to tropical islands. Economically powerful, it leads in technology and manufacturing. Asia's cultural influence is vast, with traditions spanning thousands of years.",
      owner: null,
      x: 600,
      y: 180,
    },
    {
      id: 'oceania',
      name: 'Oceania',
      phrase:
        "Oceania consists of Australia, New Zealand, and Pacific island nations such as Fiji and Papua New Guinea. It is famous for the Great Barrier Reef, indigenous cultures, and unique wildlife. The region has stunning beaches, diverse ecosystems, and a strong connection to nature. Oceania's cultural identity is shaped by its island heritage.",
      owner: null,
      x: 720,
      y: 310,
    },
    {
      id: 'antarctica',
      name: 'Antarctica',
      phrase:
        "Antarctica is Earth's coldest and most remote continent, covered in ice year-round. It has no permanent population, only scientists conducting research. Home to penguins, seals, and whales, it plays a crucial role in climate studies. Antarctica's extreme conditions make it one of the least explored and most fascinating places on the planet.",
      owner: null,
      x: 450,
      y: 420,
    },
  ];
}

// Helper function for player colors
function getPlayerColor(index) {
  const colors = [
    '#e74c3c',
    '#3498db',
    '#2ecc71',
    '#9b59b6',
    '#f39c12',
    '#1abc9c',
  ];
  return colors[index % colors.length];
}

// Generate unique game ID
function generateGameId() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Socket.io connection handler
io.on('connection', (socket) => {
  logDebug('New client connected:', socket.id);

  // Create game
  socket.on('createGame', ({ playerName }) => {
    try {
      const gameId = generateGameId();
      const player = {
        id: socket.id,
        name: playerName,
        score: 0,
        color: getPlayerColor(0),
        isHost: true,
      };

      games[gameId] = {
        id: gameId,
        players: [player],
        status: 'waiting',
        territories: createTerritories(),
        createdAt: Date.now(),
      };

      socket.join(gameId);
      socket.gameId = gameId;
      socket.playerId = player.id;

      logDebug(`Game created: ${gameId} with host: ${playerName}`);
      socket.emit('gameCreated', { gameId, player, game: games[gameId] });
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  // Join game
  socket.on('joinGame', ({ gameId, playerName }) => {
    try {
      // Normalize game ID
      gameId = gameId.trim().toUpperCase();

      if (!games[gameId]) {
        socket.emit('error', {
          message: 'Game not found. Check the Game ID and try again.',
        });
        return;
      }

      const game = games[gameId];

      if (game.status !== 'waiting') {
        socket.emit('error', {
          message: 'This game has already started or ended.',
        });
        return;
      }

      if (game.players.length >= 6) {
        socket.emit('error', { message: 'Game is full (maximum 6 players).' });
        return;
      }

      if (
        game.players.some(
          (p) => p.name.toLowerCase() === playerName.toLowerCase()
        )
      ) {
        socket.emit('error', {
          message:
            'Someone with this name is already in the game. Please use a different name.',
        });
        return;
      }

      const player = {
        id: socket.id,
        name: playerName,
        score: 0,
        color: getPlayerColor(game.players.length),
        isHost: false,
      };

      game.players.push(player);

      socket.join(gameId);
      socket.gameId = gameId;
      socket.playerId = player.id;

      socket.emit('gameJoined', { gameId, player, game });

      // Notify other players
      socket
        .to(gameId)
        .emit('playerJoined', { player, gameId, players: game.players });
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Start game
  socket.on('startGame', ({ gameId }) => {
    try {
      logDebug('Starting game', { gameId });

      if (!games[gameId]) {
        logDebug('Game not found', { gameId });
        return;
      }

      const game = games[gameId];

      // Check if player is host
      const player = game.players.find((p) => p.id === socket.id);
      if (!player) {
        logDebug('Player not found in game', { socketId: socket.id, gameId });
        return;
      }

      if (!player.isHost) {
        logDebug('Player is not host', {
          playerId: player.id,
          playerName: player.name,
        });
        return;
      }

      game.status = 'playing';
      game.timeRemaining = 180; // 3 minutes

      // Make sure territories exist
      if (!game.territories || !Array.isArray(game.territories)) {
        logDebug('Territories not found or invalid, creating new ones', {
          gameId,
        });
        game.territories = createTerritories();
      }

      // Start the game clock
      logDebug('Starting game timer');

      // Use a safer approach for the timer
      let timerCounter = game.timeRemaining;
      game.timer = setInterval(() => {
        try {
          timerCounter--;

          if (timerCounter <= 0) {
            clearInterval(game.timer);
            game.status = 'ended';
            game.timeRemaining = 0;

            // Sort players by score and include typing speeds
            const sortedPlayers = [...game.players]
              .sort((a, b) => b.score - a.score)
              .map((p) => ({
                ...p,
                avgTypingSpeed: p.avgTypingSpeed || 0,
              }));

            io.to(gameId).emit('gameOver', {
              players: sortedPlayers,
              reason: 'timeUp',
            });
          } else {
            game.timeRemaining = timerCounter;
            io.to(gameId).emit('timerUpdate', { timeRemaining: timerCounter });
          }
        } catch (timerError) {
          console.error('Error in game timer:', timerError);
          clearInterval(game.timer);
        }
      }, 1000);

      // Send a clean version of the game object to clients
      const clientGame = {
        id: game.id,
        players: game.players,
        territories: game.territories,
        status: game.status,
        timeRemaining: game.timeRemaining,
      };

      logDebug('Game started successfully', { gameId });
      io.to(gameId).emit('gameStarted', { game: clientGame });
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', {
        message: 'Failed to start game. Please try again.',
      });
    }
  });

  // Territory selection
  socket.on('selectTerritory', ({ gameId, territoryId }) => {
    try {
      if (!games[gameId] || games[gameId].status !== 'playing') return;

      const game = games[gameId];
      const territory = game.territories.find((t) => t.id === territoryId);
      if (!territory) return;

      const player = game.players.find((p) => p.id === socket.id);
      if (!player) return;

      // Notify the player about the territory selection
      socket.emit('territorySelected', { territory });

      // Notify other players that someone is attempting this territory
      socket.to(gameId).emit('territoryAttempt', {
        playerId: player.id,
        playerName: player.name,
        territoryId: territory.id,
      });
    } catch (error) {
      console.error('Error selecting territory:', error);
    }
  });

  // Territory claimed
  socket.on('claimTerritory', ({ gameId, territoryId, typingSpeed }) => {
    try {
      if (!games[gameId] || games[gameId].status !== 'playing') return;

      const game = games[gameId];
      const territory = game.territories.find((t) => t.id === territoryId);
      if (!territory) return;

      const player = game.players.find((p) => p.id === socket.id);
      if (!player) return;

      // Save typing speed for the player (now in WPM instead of CPM)
      if (!player.typingSpeeds) {
        player.typingSpeeds = [];
      }
      player.typingSpeeds.push(typingSpeed);

      // Calculate average typing speed
      const avgSpeed =
        player.typingSpeeds.reduce((sum, speed) => sum + speed, 0) /
        player.typingSpeeds.length;
      player.avgTypingSpeed = Math.round(avgSpeed);

      // Claim the territory
      territory.owner = player.id;

      // Update player score
      player.score = game.territories.filter(
        (t) => t.owner === player.id
      ).length;

      // Notify all players about the territory claim
      io.to(gameId).emit('territoryClaimed', {
        territoryId,
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        players: game.players, // Updated scores
      });

      // Check if all territories are captured
      const allCaptured = game.territories.every((t) => t.owner !== null);

      if (allCaptured && game.status === 'playing') {
        // End the game
        clearInterval(game.timer);
        game.status = 'ended';

        // Sort players by score
        const sortedPlayers = [...game.players]
          .sort((a, b) => {
            // First compare territories
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            // If tied in territories, compare typing speeds
            return (b.avgTypingSpeed || 0) - (a.avgTypingSpeed || 0);
          })
          .map((p) => ({
            ...p,
            avgTypingSpeed: p.avgTypingSpeed || 0,
          }));

        io.to(gameId).emit('gameOver', {
          players: sortedPlayers,
          reason: 'allCaptured',
        });
      }
    } catch (error) {
      console.error('Error claiming territory:', error);
    }
  });

  // Add the rest of your event handlers here with try-catch blocks
  // ...

  // Handle disconnections
  socket.on('disconnect', () => {
    try {
      logDebug('Client disconnected:', socket.id);

      if (socket.gameId && games[socket.gameId]) {
        const game = games[socket.gameId];
        const player = game.players.find((p) => p.id === socket.id);

        if (player) {
          if (player.isHost && game.status === 'waiting') {
            // If host disconnects before game starts, end the game
            socket.to(socket.gameId).emit('gameEnded', { reason: 'hostLeft' });

            // Remove from waiting games
            const index = waitingGames.indexOf(socket.gameId);
            if (index !== -1) {
              waitingGames.splice(index, 1);
            }

            // Delete the game
            delete games[socket.gameId];
          } else {
            // Remove player from the game
            game.players = game.players.filter((p) => p.id !== socket.id);

            // Notify other players
            socket.to(socket.gameId).emit('playerLeft', {
              playerId: socket.id,
              playerName: player.name,
              players: game.players,
            });

            // If game is in progress, check if there's only one player left
            if (game.status === 'playing' && game.players.length <= 1) {
              // End game if only one player remains
              if (game.timer) {
                clearInterval(game.timer);
              }

              game.status = 'ended';

              if (game.players.length === 1) {
                io.to(socket.gameId).emit('gameOver', {
                  players: game.players,
                  reason: 'opponentsLeft',
                });
              }
            }

            // If no players left, remove the game
            if (game.players.length === 0) {
              // Remove from waiting games
              const index = waitingGames.indexOf(socket.gameId);
              if (index !== -1) {
                waitingGames.splice(index, 1);
              }

              // Delete the game
              delete games[socket.gameId];
            } else if (player.isHost) {
              // If the host left, reassign host to the next player
              game.players[0].isHost = true;

              // Notify remaining players about new host
              io.to(socket.gameId).emit('newHost', {
                playerId: game.players[0].id,
                playerName: game.players[0].name,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling disconnection:', error);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
