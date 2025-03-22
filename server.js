// Add this to the top of your server.js file
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const matchmakingPlayers = []; // Array to hold players looking for a match
let matchmakingCheckInterval = null; // Reference to the interval that checks for matches
const MIN_PLAYERS_TO_START = 2; // Minimum players needed to start a game
const MATCHMAKING_CHECK_INTERVAL = 2000; // Check for matches every 2 seconds
const MATCH_COUNTDOWN_SECONDS = 30;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const games = {};
const waitingGames = [];

// Debug logging helper
function logDebug(message, data = null) {
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
}

function startMatchmakingChecker() {
  if (!matchmakingCheckInterval) {
    matchmakingCheckInterval = setInterval(
      checkForMatches,
      MATCHMAKING_CHECK_INTERVAL
    );
    console.log('Matchmaking checker started');
  }
}

// Stop the matchmaking checker if no players are waiting
function stopMatchmakingCheckerIfNeeded() {
  if (matchmakingCheckInterval && matchmakingPlayers.length === 0) {
    clearInterval(matchmakingCheckInterval);
    matchmakingCheckInterval = null;
    console.log('Matchmaking checker stopped - no players waiting');
  }
}

function checkForMatches() {
  // If we don't have enough players for a match, just return
  if (matchmakingPlayers.length < MIN_PLAYERS_TO_START) {
    return;
  }

  console.log(
    `Checking for matches with ${matchmakingPlayers.length} players waiting`
  );

  // First check if we can add players to an existing game in 'matching' status
  const matchingGames = Object.values(games).filter(
    (g) => g.status === 'matching' && g.players.length < 6
  );

  if (matchingGames.length > 0) {
    // Add players to the first matching game
    const game = matchingGames[0];
    const spotsAvailable = 6 - game.players.length; // Max 6 players per game

    if (spotsAvailable > 0) {
      // Get players to add (up to available spots)
      const playersToAdd = matchmakingPlayers.splice(0, spotsAvailable);
      console.log(
        `Adding ${playersToAdd.length} more players to existing match ${game.id}`
      );

      // Add each player to the game
      playersToAdd.forEach((socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          const playerIndex = game.players.length;

          // Create player object
          const player = {
            id: socketId,
            name: socket.playerName || `Player ${playerIndex + 1}`,
            score: 0,
            color: getPlayerColor(playerIndex),
            isHost: false, // Only the first player is host
          };

          // Add to game players
          game.players.push(player);

          // Add socket to room
          socket.join(game.id);
          socket.gameId = game.id;
          socket.playerId = socketId;

          // Notify the player
          socket.emit('matchFound', {
            gameId: game.id,
            player: player,
            game: game,
          });
        }
      });

      // Notify all players in the game about the new players
      io.to(game.id).emit('matchProgress', {
        players: game.players,
        secondsRemaining: game.countdownSeconds,
      });

      console.log(
        `Added ${playersToAdd.length} players to existing match ${game.id}, now has ${game.players.length} players`
      );
    }
    return;
  }

  // Create a new game with the waiting players (up to 6 max)
  const playersForMatch = matchmakingPlayers.splice(0, 6);
  const gameId = generateGameId();

  console.log(
    `Creating new match ${gameId} with ${playersForMatch.length} players`
  );

  // Setup players for the game
  const gamePlayers = playersForMatch.map((socketId, index) => {
    return {
      id: socketId,
      name:
        io.sockets.sockets.get(socketId).playerName || `Player ${index + 1}`,
      score: 0,
      color: getPlayerColor(index),
      isHost: index === 0, // First player is the host
    };
  });

  // Create the game
  games[gameId] = {
    id: gameId,
    players: gamePlayers,
    status: 'matching', // Use 'matching' status while waiting for more players
    territories: createTerritories(),
    createdAt: Date.now(),
    matchStartTime: Date.now() + MATCH_COUNTDOWN_SECONDS * 1000,
    countdownSeconds: MATCH_COUNTDOWN_SECONDS,
  };

  // Setup room and notify players
  playersForMatch.forEach((socketId, index) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(gameId);
      socket.gameId = gameId;
      socket.playerId = socketId;

      // Notify the player
      socket.emit('matchFound', {
        gameId,
        player: gamePlayers[index],
        game: games[gameId],
      });
    }
  });

  // Start the countdown timer for this game
  startMatchCountdown(gameId);

  console.log(`Created match ${gameId} with ${playersForMatch.length} players`);
}

// Start a countdown for a match that has reached minimum players
function startMatchCountdown(gameId) {
  const game = games[gameId];
  if (!game) return;

  console.log(
    `Starting match countdown for game ${gameId} with ${game.players.length} players`
  );

  // Initial notification
  io.to(gameId).emit('matchProgress', {
    players: game.players,
    secondsRemaining: game.countdownSeconds,
  });

  game.matchStartTimer = setInterval(() => {
    try {
      // Decrease countdown
      game.countdownSeconds--;

      // Notify all players in the game about the countdown
      io.to(gameId).emit('matchProgress', {
        players: game.players,
        secondsRemaining: game.countdownSeconds,
      });

      console.log(
        `Game ${gameId} countdown: ${game.countdownSeconds} seconds remaining`
      );

      // Check if it's time to start
      if (game.countdownSeconds <= 0) {
        console.log(
          `Match countdown finished for game ${gameId}. Starting game with ${game.players.length} players...`
        );

        // Clear the timer
        clearInterval(game.matchStartTimer);
        game.matchStartTimer = null;

        // Start the game
        game.status = 'playing';
        game.timeRemaining = 180; // 3 minutes

        // Reset any territory ownership at game start
        game.territories.forEach((territory) => {
          territory.owner = null;
        });

        // Reset player scores
        game.players.forEach((player) => {
          player.score = 0;
        });

        // Prepare a clean game object for the client
        const clientGame = {
          id: game.id,
          players: game.players,
          territories: game.territories,
          status: game.status,
          timeRemaining: game.timeRemaining,
        };

        // Notify all players that the game has started
        io.to(gameId).emit('gameStarted', { game: clientGame });

        // Start the game timer
        startGameTimer(gameId);
      }
    } catch (error) {
      console.error('Error in match countdown timer:', error);

      // Clean up the timer on error
      clearInterval(game.matchStartTimer);
      game.matchStartTimer = null;
    }
  }, 1000);
}

// Start game timer (refactored from existing code)
function startGameTimer(gameId) {
  const game = games[gameId];
  if (!game) return;

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
}

// Create initial territories data
function createTerritories() {
  return [
    {
      id: 'north-america',
      name: 'North America',
      phrase:
        'Diverse lands from Arctic tundra to Caribbean coasts. USA, Canada, Mexico lead in economy, culture & wonders.',
      owner: null,
      x: 180,
      y: 150,
    },
    {
      id: 'south-america',
      name: 'South America',
      phrase:
        'Andes, Amazon, vibrant festivals & football passion. Brazil, Argentina, Colombia hold deep history & Inca legacy.',
      owner: null,
      x: 220,
      y: 290,
    },
    {
      id: 'europe',
      name: 'Europe',
      phrase:
        'Blend of history, technology & iconic landmarks. France, Germany, Spain drive culture, economy & global influence.',
      owner: null,
      x: 450,
      y: 130,
    },
    {
      id: 'africa',
      name: 'Africa',
      phrase:
        'Vast landscapes from Sahara to Serengeti. Nigeria, Egypt, South Africa shaped by ancient civilizations & heritage.',
      owner: null,
      x: 450,
      y: 250,
    },
    {
      id: 'asia',
      name: 'Asia',
      phrase:
        'Largest, most populated & diverse. China, India, Japan lead in ancient traditions, economy, tech & innovation.',
      owner: null,
      x: 600,
      y: 180,
    },
    {
      id: 'oceania',
      name: 'Oceania',
      phrase:
        'Australia, New Zealand & Pacific islands. Unique wildlife, Great Barrier Reef & rich indigenous traditions thrive.',
      owner: null,
      x: 720,
      y: 310,
    },
    {
      id: 'antarctica',
      name: 'Antarctica',
      phrase:
        'Coldest, most remote & uninhabited. No cities, only scientists. Key for climate research, home to penguins & ice.',
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

  // Find match handler
  socket.on('findMatch', ({ playerName }) => {
    try {
      // Store player name for later use
      socket.playerName = playerName;

      // Add this player to the matchmaking queue
      matchmakingPlayers.push(socket.id);

      // Start the matchmaking checker if needed
      startMatchmakingChecker();

      // Notify the player that matchmaking has started
      socket.emit('matchmaking', {
        status: 'waiting',
        waitingPlayers: matchmakingPlayers.length,
      });

      console.log(
        `Player ${playerName} (${socket.id}) joined matchmaking queue`
      );

      // Broadcast to all players in matchmaking about the updated count
      matchmakingPlayers.forEach((playerId) => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket && playerId !== socket.id) {
          playerSocket.emit('matchmaking', {
            status: 'waiting',
            waitingPlayers: matchmakingPlayers.length,
          });
        }
      });
    } catch (error) {
      console.error('Error in findMatch:', error);
      socket.emit('error', { message: 'Failed to start matchmaking' });
    }
  });

  // Cancel matchmaking
  socket.on('cancelMatchmaking', () => {
    try {
      // Remove player from matchmaking queue
      const index = matchmakingPlayers.indexOf(socket.id);
      if (index !== -1) {
        matchmakingPlayers.splice(index, 1);
        console.log(`Player ${socket.id} cancelled matchmaking`);
      }

      // Check if we need to stop the checker
      stopMatchmakingCheckerIfNeeded();

      // Notify the player
      socket.emit('matchmakingCancelled');

      // Notify remaining players about the updated count
      matchmakingPlayers.forEach((playerId) => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
          playerSocket.emit('matchmaking', {
            status: 'waiting',
            waitingPlayers: matchmakingPlayers.length,
          });
        }
      });
    } catch (error) {
      console.error('Error in cancelMatchmaking:', error);
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

      // Reset any territory ownership at game start
      game.territories.forEach((territory) => {
        territory.owner = null;
      });

      // Reset player scores
      game.players.forEach((player) => {
        player.score = 0;
      });

      // Start the game clock
      startGameTimer(gameId);

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

      // Check if territory is already owned
      if (territory.owner !== null) {
        // Territory already claimed, notify player
        socket.emit('territoryAlreadyClaimed', {
          territoryId,
          ownerId: territory.owner,
          ownerName:
            game.players.find((p) => p.id === territory.owner)?.name ||
            'Another player',
        });
        return;
      }

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

  // Handle disconnections
  socket.on('disconnect', () => {
    try {
      logDebug('Client disconnected:', socket.id);

      // Remove player from matchmaking queue if they're in it
      if (matchmakingPlayers.includes(socket.id)) {
        const index = matchmakingPlayers.indexOf(socket.id);
        if (index !== -1) {
          matchmakingPlayers.splice(index, 1);
          console.log(
            `Player ${socket.id} removed from matchmaking due to disconnect`
          );
        }

        // Check if we need to stop the checker
        stopMatchmakingCheckerIfNeeded();

        // Notify remaining players about the updated count
        matchmakingPlayers.forEach((playerId) => {
          const playerSocket = io.sockets.sockets.get(playerId);
          if (playerSocket) {
            playerSocket.emit('matchmaking', {
              status: 'waiting',
              waitingPlayers: matchmakingPlayers.length,
            });
          }
        });
      }

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
