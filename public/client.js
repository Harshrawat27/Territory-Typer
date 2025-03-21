// client.js - Complete file with all new features

// Connect to Socket.io server
const socket = io();

// Game state
const gameState = {
  isActive: false,
  players: [],
  territories: [],
  currentPlayer: null,
  selectedTerritory: null,
  timeRemaining: 180,
  playerColors: [
    '#e74c3c',
    '#3498db',
    '#2ecc71',
    '#9b59b6',
    '#f39c12',
    '#1abc9c',
  ],
  gameId: null,
  isHost: false,
  gameMode: null,
};

// Typing speed tracking
let typingStartTime = 0;
let currentPhraseLength = 0;

// DOM Elements
const elements = {
  setupPanel: document.getElementById('game-setup'),

  // Option buttons
  createGameBtn: document.getElementById('create-game-btn'),
  joinGameBtn: document.getElementById('join-game-btn'),
  randomMatchBtn: document.getElementById('random-match-btn'),

  // Create game panel
  createGamePanel: document.getElementById('create-game-panel'),
  createPlayerName: document.getElementById('create-player-name'),
  createGameButton: document.getElementById('create-game'),
  gameCreatedDiv: document.getElementById('game-created'),
  gameIdDisplay: document.getElementById('game-id-display'),
  copyGameIdBtn: document.getElementById('copy-game-id'),
  hostPlayersList: document.getElementById('host-players-list'),
  startGameBtn: document.getElementById('start-game'),

  // Join game panel
  joinGamePanel: document.getElementById('join-game-panel'),
  joinPlayerName: document.getElementById('join-player-name'),
  gameIdInput: document.getElementById('game-id-input'),
  joinGameButton: document.getElementById('join-game'),
  joinedGameDiv: document.getElementById('joined-game'),
  guestPlayersList: document.getElementById('guest-players-list'),

  // Random match panel
  randomMatchPanel: document.getElementById('random-match-panel'),
  randomPlayerName: document.getElementById('random-player-name'),
  findMatchBtn: document.getElementById('find-match'),
  findingMatchDiv: document.getElementById('finding-match'),
  cancelMatchmakingBtn: document.getElementById('cancel-matchmaking'),
  randomPlayersList: document.getElementById('random-players-list'),

  // Game elements
  mapContainer: document.getElementById('map-container'),
  worldMap: document.getElementById('world-map'),
  currentPhrase: document.getElementById('current-phrase'),
  typingInput: document.getElementById('typing-input'),
  placeholderText: document.getElementById('placeholder-text'),
  typingWrapper: document.getElementById('typing-wrapper'),
  timer: document.getElementById('timer'),
  scores: document.getElementById('scores'),
  activePlayers: document.getElementById('active-players'),
  gameOver: document.getElementById('game-over'),
  finalScores: document.getElementById('final-scores'),
  playAgainBtn: document.getElementById('play-again'),
};

// Initialize territory labels
function initTerritoryLabels() {
  // Remove any existing labels
  document
    .querySelectorAll('.territory-label')
    .forEach((label) => label.remove());

  // Function to calculate appropriate label position based on SVG viewBox and container size
  function calculateLabelPosition(territory, mapContainer) {
    // Get the map container dimensions
    const containerRect = mapContainer.getBoundingClientRect();

    // Get the SVG element
    const svgElement = document.getElementById('world-map');

    // Get SVG viewBox values
    const viewBox = svgElement.getAttribute('viewBox').split(' ');
    const svgWidth = parseFloat(viewBox[2]);
    const svgHeight = parseFloat(viewBox[3]);

    // Calculate scaling factors
    const scaleX = containerRect.width / svgWidth;
    const scaleY = containerRect.height / svgHeight;

    // Calculate the scaled coordinates (adjusted for the current display size)
    const scaledX = territory.x * scaleX;
    const scaledY = territory.y * scaleY;

    // For territories on the right side of the map, position labels to the left of the point
    // to ensure they stay within the viewport
    const isRightSide = territory.x > svgWidth * 0.6;

    return {
      left: isRightSide ? `${scaledX - 100}px` : `${scaledX + 10}px`,
      top: `${scaledY - 15}px`,
      textAlign: isRightSide ? 'right' : 'left',
    };
  }

  // Create the labels with responsive positioning
  gameState.territories.forEach((territory) => {
    const label = document.createElement('div');
    label.className = 'territory-label';
    label.textContent = territory.name;

    // Calculate and set the position
    const position = calculateLabelPosition(territory, elements.mapContainer);
    label.style.left = position.left;
    label.style.top = position.top;
    label.style.textAlign = position.textAlign;

    // Add data attribute to help with territory identification
    label.dataset.territoryId = territory.id;

    // Add the label to the map container
    elements.mapContainer.appendChild(label);
  });

  // Add window resize listener to update label positions when the window size changes
  window.addEventListener('resize', function () {
    gameState.territories.forEach((territory) => {
      const label = document.querySelector(
        `.territory-label[data-territory-id="${territory.id}"]`
      );
      if (label) {
        const position = calculateLabelPosition(
          territory,
          elements.mapContainer
        );
        label.style.left = position.left;
        label.style.top = position.top;
        label.style.textAlign = position.textAlign;
      }
    });
  });
}

// Attach event listeners to territories
function attachTerritoryEvents() {
  document.querySelectorAll('.territory').forEach((territoryEl) => {
    // Add mouseover effect for better UX
    territoryEl.addEventListener('mouseover', () => {
      if (!gameState.isActive) return;

      // Add a hover class to the territory
      territoryEl.classList.add('territory-hover');

      // Highlight the corresponding label
      const territoryId = territoryEl.id;
      const label = document.querySelector(
        `.territory-label[data-territory-id="${territoryId}"]`
      );
      if (label) {
        label.classList.add('hover');
      }
    });

    // Remove hover effect
    territoryEl.addEventListener('mouseout', () => {
      territoryEl.classList.remove('territory-hover');

      // Remove highlight from label
      const territoryId = territoryEl.id;
      const label = document.querySelector(
        `.territory-label[data-territory-id="${territoryId}"]`
      );
      if (label) {
        label.classList.remove('hover');
      }
    });

    // Click event
    territoryEl.addEventListener('click', () => {
      if (!gameState.isActive) return;

      const territory = gameState.territories.find(
        (t) => t.id === territoryEl.id
      );

      if (territory) {
        // Remove active class from all territories and labels
        document
          .querySelectorAll('.territory')
          .forEach((t) => t.classList.remove('territory-active'));
        document
          .querySelectorAll('.territory-label')
          .forEach((l) => l.classList.remove('active'));

        // Add active class to the selected territory and its label
        territoryEl.classList.add('territory-active');
        const label = document.querySelector(
          `.territory-label[data-territory-id="${territory.id}"]`
        );
        if (label) {
          label.classList.add('active');
        }

        selectTerritory(territory);
      }
    });
  });

  // Also make labels clickable to select territories (for mobile users)
  document.querySelectorAll('.territory-label').forEach((label) => {
    label.style.pointerEvents = 'auto'; // Make labels clickable

    label.addEventListener('click', () => {
      if (!gameState.isActive) return;

      const territoryId = label.dataset.territoryId;
      const territory = gameState.territories.find((t) => t.id === territoryId);
      const territoryEl = document.getElementById(territoryId);

      if (territory && territoryEl) {
        // Remove active class from all territories and labels
        document
          .querySelectorAll('.territory')
          .forEach((t) => t.classList.remove('territory-active'));
        document
          .querySelectorAll('.territory-label')
          .forEach((l) => l.classList.remove('active'));

        // Add active class to the selected territory and its label
        territoryEl.classList.add('territory-active');
        label.classList.add('active');

        selectTerritory(territory);
      }
    });
  });
}

// Add this function to normalize apostrophes in your client.js file
function normalizeApostrophes(text) {
  return text.replace(/['′'‛]/g, "'");
}

// Calculate Words Per Minute (WPM)
function calculateWPM(charCount, timeInSeconds) {
  // Standard calculation: 5 characters = 1 word, divide by time in minutes
  const wordCount = charCount / 5;
  const timeInMinutes = timeInSeconds / 60;
  return Math.round(wordCount / timeInMinutes);
}

// Select a territory to claim
function selectTerritory(territory) {
  if (territory.owner === gameState.currentPlayer.id) {
    elements.currentPhrase.textContent = `You already own ${territory.name}!`;
    return;
  }

  if (territory.owner !== null) {
    elements.currentPhrase.textContent = `${territory.name} is already claimed!`;
    return;
  }

  gameState.selectedTerritory = territory;
  elements.currentPhrase.textContent = `Claim ${territory.name} by typing:`;

  // Initialize typing timer
  typingStartTime = Date.now();
  currentPhraseLength = territory.phrase.length;

  // Clear the typing wrapper
  elements.typingWrapper.innerHTML = '';

  // Create the character-by-character display
  const referenceText = normalizeApostrophes(territory.phrase);

  // Create a container for the reference text
  const referenceContainer = document.createElement('div');
  referenceContainer.className = 'reference-text';

  // Create spans for each character
  for (let i = 0; i < referenceText.length; i++) {
    const charSpan = document.createElement('span');
    charSpan.textContent = referenceText[i];
    charSpan.className = 'reference-char';
    charSpan.dataset.index = i;
    referenceContainer.appendChild(charSpan);
  }

  // Add the reference container to the typing wrapper
  elements.typingWrapper.appendChild(referenceContainer);

  // Create a hidden input for typing
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'text';
  hiddenInput.className = 'hidden-input';
  hiddenInput.autocomplete = 'off';
  hiddenInput.spellcheck = false;
  elements.typingWrapper.appendChild(hiddenInput);

  // Create a status indicator for feedback
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'typing-status';
  statusIndicator.textContent = 'Start typing...';
  elements.typingWrapper.appendChild(statusIndicator);

  // Store reference to elements
  elements.typingStatus = statusIndicator;

  // Focus the hidden input
  hiddenInput.focus();

  // Add event listeners to the hidden input
  hiddenInput.addEventListener('input', handleTyping);
  hiddenInput.addEventListener('paste', function (e) {
    e.preventDefault();
    return false;
  });

  // Store reference to the hidden input
  elements.typingInput = hiddenInput;

  // Notify server about territory selection
  socket.emit('selectTerritory', {
    gameId: gameState.gameId,
    territoryId: territory.id,
  });
}

// New typing handler
function handleTyping(e) {
  if (!gameState.selectedTerritory) return;

  const referenceText = normalizeApostrophes(
    gameState.selectedTerritory.phrase
  );
  let typedText = normalizeApostrophes(e.target.value);

  // Prevent typing beyond valid characters
  let validTyping = true;
  let firstErrorPos = -1;

  // Check if any characters typed so far are incorrect
  for (let i = 0; i < typedText.length; i++) {
    if (i >= referenceText.length || typedText[i] !== referenceText[i]) {
      validTyping = false;
      firstErrorPos = i;
      break;
    }
  }

  // If there's an error, truncate the typed text to the last valid position
  if (!validTyping && firstErrorPos >= 0) {
    typedText = typedText.substring(0, firstErrorPos);
    e.target.value = typedText;
    // Show error status
    if (elements.typingStatus) {
      elements.typingStatus.textContent = 'Error! Fix before continuing.';
      elements.typingStatus.className = 'typing-status error';

      // Add shake animation to the error character
      const referenceChars = document.querySelectorAll('.reference-char');
      if (firstErrorPos < referenceChars.length) {
        referenceChars[firstErrorPos].classList.add('shake');
        // Remove the shake class after animation completes
        setTimeout(() => {
          referenceChars[firstErrorPos].classList.remove('shake');
        }, 500);
      }
    }
  } else if (elements.typingStatus) {
    // Show progress status
    const progress = Math.floor(
      (typedText.length / referenceText.length) * 100
    );
    elements.typingStatus.textContent = `Progress: ${progress}% complete`;
    elements.typingStatus.className = 'typing-status';
  }

  // Update character styling based on what's been typed
  const referenceChars = document.querySelectorAll('.reference-char');

  for (let i = 0; i < referenceChars.length; i++) {
    const charSpan = referenceChars[i];

    if (i < typedText.length) {
      // Character has been typed (all should be correct due to our validation)
      charSpan.className = 'reference-char correct';

      // Add cursor indicator to the next character to type
      if (i === typedText.length - 1 && i + 1 < referenceChars.length) {
        referenceChars[i + 1].classList.add('current');
      }
    } else {
      // Remove current indicator from all other chars
      charSpan.classList.remove('current');

      // Character not yet typed
      charSpan.className = 'reference-char';
    }
  }

  // Check if typing is complete (all text typed correctly)
  if (typedText.length === referenceText.length) {
    // Calculate typing speed in WPM
    const typingTime = (Date.now() - typingStartTime) / 1000; // in seconds
    const typingWPM = calculateWPM(currentPhraseLength, typingTime);

    // Update typing status
    if (elements.typingStatus) {
      elements.typingStatus.textContent = `Completed! Your typing speed: ${typingWPM} WPM`;
      elements.typingStatus.className = 'typing-status success';
    }

    // Notify server
    socket.emit('claimTerritory', {
      gameId: gameState.gameId,
      territoryId: gameState.selectedTerritory.id,
      typingSpeed: typingWPM, // Now sending WPM instead of CPM
    });

    // Show completion message
    setTimeout(() => {
      // Clear the typing area
      elements.typingWrapper.innerHTML = '';
      elements.currentPhrase.textContent = `You claimed ${gameState.selectedTerritory.name}!`;
      gameState.selectedTerritory = null;
    }, 1500); // Show completion message for 1.5 seconds before clearing
  }
}

// Add this to initialize the typing system when the game starts
function initTypingSystem() {
  // Remove old event listeners
  const oldInput = elements.typingInput;
  if (oldInput) {
    oldInput.removeEventListener('input', handleTyping);
    oldInput.removeEventListener('paste', function (e) {
      e.preventDefault();
      return false;
    });
  }

  // Clear the typing wrapper
  elements.typingWrapper.innerHTML = '';
  elements.currentPhrase.textContent = 'Click on a territory to start typing!';
}
const originalStartGame = startGame;
startGame = function () {
  originalStartGame();
  initTypingSystem();
};

// Function to update the visibility of placeholder text as user types
function updatePlaceholderVisibility(typedText, targetPhrase) {
  if (typedText.length === 0) {
    elements.placeholderText.textContent = targetPhrase;
    elements.placeholderText.classList.remove('error');
    return;
  }

  // Check if what's typed so far matches the start of the target phrase
  if (targetPhrase.startsWith(typedText)) {
    // Show only the remaining text
    elements.placeholderText.textContent = targetPhrase.substring(
      typedText.length
    );
    elements.placeholderText.classList.remove('error');
  } else {
    // If there's a mismatch, show error
    elements.placeholderText.classList.add('error');
  }
}

// Claim a territory for a player (UI update)
function claimTerritory(territoryId, playerId) {
  const territory = gameState.territories.find((t) => t.id === territoryId);
  if (!territory) return;

  territory.owner = playerId;
  const territoryEl = document.getElementById(territoryId);

  // Find player color
  const player = gameState.players.find((p) => p.id === playerId);
  if (player) {
    territoryEl.setAttribute('fill', player.color);
    territoryEl.setAttribute('stroke', '#666');
  }
}

// Update player scores display
function updateScores() {
  // Update score display
  elements.scores.innerHTML = '';
  gameState.players.forEach((player) => {
    const playerScore = document.createElement('div');
    playerScore.className = 'player';

    const colorBox = document.createElement('div');
    colorBox.className = 'player-color';
    colorBox.style.backgroundColor = player.color;

    playerScore.appendChild(colorBox);
    playerScore.appendChild(
      document.createTextNode(`${player.name}: ${player.score} territories`)
    );
    elements.scores.appendChild(playerScore);
  });
}

function updateTerritoryColors() {
  gameState.territories.forEach((territory) => {
    const territoryEl = document.getElementById(territory.id);
    if (!territoryEl) return;

    if (territory.owner) {
      // Find owner's color
      const owner = gameState.players.find((p) => p.id === territory.owner);
      if (owner) {
        territoryEl.setAttribute('fill', owner.color);
        territoryEl.setAttribute('stroke', '#666');

        // Also update the label to match owner's color
        const label = document.querySelector(
          `.territory-label[data-territory-id="${territory.id}"]`
        );
        if (label) {
          label.style.backgroundColor = owner.color;
          label.style.color = '#fff';
          label.style.borderColor = 'rgba(0,0,0,0.2)';
        }
      }
    } else {
      // Unowned territory
      territoryEl.setAttribute('fill', '#eee');
      territoryEl.setAttribute('stroke', '#ccc');

      // Reset label styling
      const label = document.querySelector(
        `.territory-label[data-territory-id="${territory.id}"]`
      );
      if (label) {
        label.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
        label.style.color = '#333';
        label.style.borderColor = 'rgba(0, 0, 0, 0.1)';
      }
    }
  });
}

// Start the game
function startGame() {
  gameState.isActive = true;
  elements.setupPanel.style.display = 'none';

  // Reset any previous game state
  gameState.territories.forEach((territory) => {
    territory.owner = null;
  });

  // Initialize territory labels with the new responsive approach
  initTerritoryLabels();

  // Attach events to territories and labels
  attachTerritoryEvents();

  // Update territory colors
  updateTerritoryColors();

  // Update display
  updateScores();
  elements.currentPhrase.textContent = 'Click on a territory to start typing!';
  elements.placeholderText.textContent = '';
}

// Also update the claimTerritory function to call updateTerritoryColors
socket.on(
  'territoryClaimed',
  ({ territoryId, playerId, playerName, playerColor, players }) => {
    // Update the game state
    gameState.players = players;

    // Update the UI - now using the new function
    updateTerritoryColors();
    updateScores();

    // If this player was typing for this territory, notify them
    if (
      gameState.selectedTerritory &&
      gameState.selectedTerritory.id === territoryId &&
      playerId !== gameState.currentPlayer.id
    ) {
      elements.currentPhrase.textContent = `${playerName} claimed ${gameState.selectedTerritory.name} before you!`;
      elements.typingInput.disabled = true;
      elements.placeholderText.textContent = '';
      gameState.selectedTerritory = null;

      // Remove active classes
      document
        .querySelectorAll('.territory-label')
        .forEach((l) => l.classList.remove('active'));
    }
  }
);

// End the game
function endGame(players) {
  gameState.isActive = false;

  // Find the winner (first player in the sorted list)
  const winner = players.length > 0 ? players[0] : null;

  // Display final scores with typing speeds
  elements.finalScores.innerHTML = '<h3>Final Standings:</h3>';

  if (winner) {
    const winnerBanner = document.createElement('div');
    winnerBanner.className = 'winner-banner';
    winnerBanner.innerHTML = `🏆 <span style="color:${winner.color}">${winner.name}</span> wins with ${winner.score} territories! 🏆`;

    // Add a note about tiebreaker if there are ties
    const hasTies = players.filter((p) => p.score === winner.score).length > 1;
    if (hasTies) {
      const tieNote = document.createElement('div');
      tieNote.className = 'winner-note';
      tieNote.textContent = `Tied players ranked by typing speed (WPM)`;
      winnerBanner.appendChild(tieNote);
    }

    elements.finalScores.appendChild(winnerBanner);
  }

  const scoresTable = document.createElement('table');
  scoresTable.className = 'scores-table';

  // Add table header
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
      <th>Rank</th>
      <th>Player</th>
      <th>Territories</th>
      <th>Typing Speed</th>
  `;
  scoresTable.appendChild(headerRow);

  // Add player rows
  players.forEach((player, index) => {
    const playerRow = document.createElement('tr');

    // Check for ties in territories
    const isTied = index > 0 && player.score === players[index - 1].score;
    const isTiedWinner =
      index === 0 && players.length > 1 && player.score === players[1].score;

    if (isTiedWinner) {
      playerRow.className = 'tied-winner';
    } else if (isTied) {
      playerRow.className = 'tied';
    }

    playerRow.innerHTML = `
        <td>${index + 1}</td>
        <td><span style="color:${player.color}">${player.name}</span></td>
        <td>${player.score}</td>
        <td>${player.avgTypingSpeed || 0} WPM</td>
    `;
    scoresTable.appendChild(playerRow);
  });

  elements.finalScores.appendChild(scoresTable);

  // Show game over screen
  elements.gameOver.style.display = 'flex';
}

// Update player lists
function updatePlayersList(listElement, players) {
  listElement.innerHTML = '';
  players.forEach((player) => {
    const playerItem = document.createElement('li');
    playerItem.style.color = player.color;
    playerItem.innerHTML = `${player.name} ${player.isHost ? '(Host)' : ''}`;
    listElement.appendChild(playerItem);
  });
}

// EVENT HANDLERS

// Check typing accuracy and handle territory claim
elements.typingInput.addEventListener('input', (e) => {
  if (!gameState.selectedTerritory) return;

  const targetPhrase = gameState.selectedTerritory.phrase;
  let typedText = e.target.value;

  // Check if the input was a paste event
  const inputType = e.inputType;
  if (inputType === 'insertFromPaste') {
    // Block paste by reverting to previous value
    e.preventDefault();
    e.target.value = typedText.substring(0, typedText.length - 1);
    return;
  }

  // Normalize apostrophes in both the typed text and target phrase
  const normalizedTyped = normalizeApostrophes(typedText);
  const normalizedTarget = normalizeApostrophes(targetPhrase);

  // Update placeholder visibility with normalized text
  updatePlaceholderVisibility(normalizedTyped, normalizedTarget);

  // Check if the normalized typed text matches the normalized phrase
  if (normalizedTyped === normalizedTarget) {
    // Calculate typing speed (characters per minute)
    const typingTime = (Date.now() - typingStartTime) / 1000; // in seconds
    const typingSpeed = Math.round((currentPhraseLength / typingTime) * 60); // chars per minute

    // Notify server about territory claim with typing speed
    socket.emit('claimTerritory', {
      gameId: gameState.gameId,
      territoryId: gameState.selectedTerritory.id,
      typingSpeed: typingSpeed,
    });

    elements.typingInput.value = '';
    elements.placeholderText.textContent = '';
    elements.typingInput.disabled = true;
    elements.currentPhrase.textContent = `You claimed ${gameState.selectedTerritory.name}!`;
    gameState.selectedTerritory = null;
  }
});

// Prevent paste in typing input
elements.typingInput.addEventListener('paste', function (e) {
  e.preventDefault();
  return false;
});

// Prevent right-click context menu in typing area
if (elements.typingWrapper) {
  elements.typingWrapper.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  });
}

// Tab switching functionality
elements.createGameBtn.addEventListener('click', () => {
  elements.createGameBtn.classList.add('active');
  elements.joinGameBtn.classList.remove('active');
  elements.randomMatchBtn.classList.remove('active');

  elements.createGamePanel.classList.add('active');
  elements.joinGamePanel.classList.remove('active');
  elements.randomMatchPanel.classList.remove('active');
});

elements.joinGameBtn.addEventListener('click', () => {
  elements.createGameBtn.classList.remove('active');
  elements.joinGameBtn.classList.add('active');
  elements.randomMatchBtn.classList.remove('active');

  elements.createGamePanel.classList.remove('active');
  elements.joinGamePanel.classList.add('active');
  elements.randomMatchPanel.classList.remove('active');
});

elements.randomMatchBtn.addEventListener('click', () => {
  elements.createGameBtn.classList.remove('active');
  elements.joinGameBtn.classList.remove('active');
  elements.randomMatchBtn.classList.add('active');

  elements.createGamePanel.classList.remove('active');
  elements.joinGamePanel.classList.remove('active');
  elements.randomMatchPanel.classList.add('active');
});

// Create game functionality
elements.createGameButton.addEventListener('click', () => {
  const playerName = elements.createPlayerName.value.trim();
  if (!playerName) {
    alert('Please enter your nickname');
    return;
  }

  // Send create game request to server
  socket.emit('createGame', { playerName });
});

// Copy game ID functionality
elements.copyGameIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(gameState.gameId).then(() => {
    elements.copyGameIdBtn.textContent = 'Copied!';
    setTimeout(() => {
      elements.copyGameIdBtn.textContent = 'Copy Game ID';
    }, 2000);
  });
});

// Join game functionality
elements.joinGameButton.addEventListener('click', () => {
  const playerName = elements.joinPlayerName.value.trim();
  const gameId = elements.gameIdInput.value.trim().toUpperCase();

  if (!playerName || !gameId) {
    alert('Please enter both your name and the game ID');
    return;
  }

  // Send join game request to server
  socket.emit('joinGame', { gameId, playerName });
});

// Random matchmaking functionality
elements.findMatchBtn.addEventListener('click', () => {
  const playerName = elements.randomPlayerName.value.trim();
  if (!playerName) {
    alert('Please enter your nickname');
    return;
  }

  // Send find match request to server
  socket.emit('findMatch', { playerName });
});

// Cancel matchmaking
elements.cancelMatchmakingBtn.addEventListener('click', () => {
  // Send cancel matchmaking request to server
  socket.emit('cancelMatchmaking');
});

// Start game (host only)
elements.startGameBtn.addEventListener('click', () => {
  if (gameState.isHost && gameState.players.length >= 1) {
    socket.emit('startGame', { gameId: gameState.gameId });
  }
});

// Play again button
elements.playAgainBtn.addEventListener('click', () => {
  elements.gameOver.style.display = 'none';
  elements.setupPanel.style.display = 'flex';

  // Send play again request to server
  socket.emit('playAgain');

  // Reset UI for all panels
  elements.createPlayerName.disabled = false;
  elements.createPlayerName.value = '';
  elements.createGameButton.style.display = 'block';
  elements.gameCreatedDiv.style.display = 'none';
  elements.hostPlayersList.innerHTML = '';

  elements.joinPlayerName.disabled = false;
  elements.joinPlayerName.value = '';
  elements.gameIdInput.disabled = false;
  elements.gameIdInput.value = '';
  elements.joinGameButton.style.display = 'block';
  elements.joinedGameDiv.style.display = 'none';
  elements.guestPlayersList.innerHTML = '';

  elements.randomPlayerName.disabled = false;
  elements.randomPlayerName.value = '';
  elements.findMatchBtn.style.display = 'block';
  elements.findingMatchDiv.style.display = 'none';
  elements.randomPlayersList.innerHTML = '';

  // Reset game state
  gameState.gameId = null;
  gameState.isHost = false;
  gameState.gameMode = null;
  gameState.players = [];
  gameState.currentPlayer = null;
});

// SOCKET.IO EVENT HANDLERS

// Game created
socket.on('gameCreated', ({ gameId, player, game }) => {
  gameState.gameId = gameId;
  gameState.isHost = true;
  gameState.gameMode = 'create';
  gameState.players = game.players;
  gameState.territories = game.territories;
  gameState.currentPlayer = player;

  // Update UI
  elements.createPlayerName.disabled = true;
  elements.createGameButton.style.display = 'none';
  elements.gameCreatedDiv.style.display = 'block';
  elements.gameIdDisplay.textContent = gameId;

  // Add player to the list
  updatePlayersList(elements.hostPlayersList, game.players);
});

// Game joined
socket.on('gameJoined', ({ gameId, player, game }) => {
  gameState.gameId = gameId;
  gameState.isHost = false;
  gameState.gameMode = 'join';
  gameState.players = game.players;
  gameState.territories = game.territories;
  gameState.currentPlayer = player;

  // Update UI
  elements.joinPlayerName.disabled = true;
  elements.gameIdInput.disabled = true;
  elements.joinGameButton.style.display = 'none';
  elements.joinedGameDiv.style.display = 'block';

  // Add players to the list
  updatePlayersList(elements.guestPlayersList, game.players);
});

// Player joined
socket.on('playerJoined', ({ player, gameId, players }) => {
  gameState.players = players;

  // Update the player list depending on which panel is active
  if (gameState.gameMode === 'create') {
    updatePlayersList(elements.hostPlayersList, players);
  } else if (gameState.gameMode === 'join') {
    updatePlayersList(elements.guestPlayersList, players);
  } else if (gameState.gameMode === 'random') {
    updatePlayersList(elements.randomPlayersList, players);
    document.querySelector('#finding-match .player-list').style.display =
      'block';
  }
});

// Game started
socket.on('gameStarted', ({ game }) => {
  gameState.territories = game.territories;
  gameState.timeRemaining = game.timeRemaining;

  initTerritoryLabels();
  startGame();
});

// Timer update
socket.on('timerUpdate', ({ timeRemaining }) => {
  gameState.timeRemaining = timeRemaining;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  elements.timer.textContent = `${minutes}:${seconds
    .toString()
    .padStart(2, '0')}`;
});

// Territory selected
socket.on('territorySelected', ({ territory }) => {
  // This confirms our selection was received by the server
  // No action needed as we already updated the UI
});

// Territory attempt by another player
socket.on('territoryAttempt', ({ playerId, playerName, territoryId }) => {
  // Another player is attempting to claim this territory
  // You could add some UI indication if you wanted
});

// Territory claimed
socket.on(
  'territoryClaimed',
  ({ territoryId, playerId, playerName, playerColor, players }) => {
    // Update the game state
    gameState.players = players;

    // Update the UI
    claimTerritory(territoryId, playerId);
    updateScores();

    // If this player was typing for this territory, notify them
    if (
      gameState.selectedTerritory &&
      gameState.selectedTerritory.id === territoryId &&
      playerId !== gameState.currentPlayer.id
    ) {
      elements.currentPhrase.textContent = `${playerName} claimed ${gameState.selectedTerritory.name} before you!`;
      elements.typingInput.disabled = true;
      elements.placeholderText.textContent = '';
      gameState.selectedTerritory = null;
    }
  }
);

// Matchmaking
socket.on('matchmaking', ({ gameId, player, game, status }) => {
  gameState.gameId = gameId;
  gameState.isHost = player.isHost;
  gameState.gameMode = 'random';
  gameState.players = game.players;
  gameState.territories = game.territories;
  gameState.currentPlayer = player;

  // Update UI
  elements.randomPlayerName.disabled = true;
  elements.findMatchBtn.style.display = 'none';
  elements.findingMatchDiv.style.display = 'block';
});

// Match found
socket.on('matchFound', ({ gameId, player, game }) => {
  gameState.gameId = gameId;
  gameState.isHost = player.isHost;
  gameState.gameMode = 'random';
  gameState.players = game.players;
  gameState.territories = game.territories;
  gameState.currentPlayer = player;

  // Update UI
  document.querySelector('#finding-match .player-list').style.display = 'block';
  updatePlayersList(elements.randomPlayersList, game.players);
});

// Matchmaking cancelled
socket.on('matchmakingCancelled', () => {
  // Reset UI
  elements.randomPlayerName.disabled = false;
  elements.findMatchBtn.style.display = 'block';
  elements.findingMatchDiv.style.display = 'none';
  document.querySelector('#finding-match .player-list').style.display = 'none';

  // Reset game state
  gameState.gameId = null;
  gameState.isHost = false;
  gameState.gameMode = null;
  gameState.players = [];
  gameState.currentPlayer = null;
});

// Game over
socket.on('gameOver', ({ players, reason }) => {
  gameState.isActive = false;

  // Add reason to display if needed
  let reasonText = '';
  if (reason === 'allCaptured') {
    reasonText = 'All territories have been captured!';
  } else if (reason === 'timeUp') {
    reasonText = 'Time is up!';
  } else if (reason === 'opponentsLeft') {
    reasonText = 'Your opponents have left the game!';
  }

  // Show reason if available
  if (reasonText) {
    const reasonElement = document.createElement('p');
    reasonElement.className = 'game-end-reason';
    reasonElement.textContent = reasonText;
    elements.finalScores.innerHTML = '';
    elements.finalScores.appendChild(reasonElement);
  }

  endGame(players);
});

// Player left
socket.on('playerLeft', ({ playerId, playerName, players }) => {
  gameState.players = players;

  // Update the player list
  if (gameState.gameMode === 'create') {
    updatePlayersList(elements.hostPlayersList, players);
  } else if (gameState.gameMode === 'join') {
    updatePlayersList(elements.guestPlayersList, players);
  } else if (gameState.gameMode === 'random') {
    updatePlayersList(elements.randomPlayersList, players);
  }

  if (gameState.isActive) {
    updateScores();
  }
});

// New host assigned
socket.on('newHost', ({ playerId, playerName }) => {
  const player = gameState.players.find((p) => p.id === playerId);
  if (player) {
    player.isHost = true;

    // Update UI to show new host
    if (playerId === gameState.currentPlayer.id) {
      gameState.isHost = true;
      // You are now the host
      if (!gameState.isActive) {
        elements.startGameBtn.style.display = 'block';
      }
    }

    // Update the player list
    if (gameState.gameMode === 'create') {
      updatePlayersList(elements.hostPlayersList, gameState.players);
    } else if (gameState.gameMode === 'join') {
      updatePlayersList(elements.guestPlayersList, gameState.players);
    } else if (gameState.gameMode === 'random') {
      updatePlayersList(elements.randomPlayersList, gameState.players);
    }
  }
});

// Game ended
socket.on('gameEnded', ({ reason }) => {
  // Handle different reasons for game ending
  let message = '';

  switch (reason) {
    case 'hostLeft':
      message = 'The host left the game.';
      break;
    case 'cancelled':
      message = 'The game was cancelled.';
      break;
    default:
      message = 'The game has ended.';
  }

  if (!gameState.isActive) {
    alert(message);

    // Reset UI based on game mode
    if (gameState.gameMode === 'join') {
      elements.joinPlayerName.disabled = false;
      elements.gameIdInput.disabled = false;
      elements.joinGameButton.style.display = 'block';
      elements.joinedGameDiv.style.display = 'none';
    } else if (gameState.gameMode === 'random') {
      elements.randomPlayerName.disabled = false;
      elements.findMatchBtn.style.display = 'block';
      elements.findingMatchDiv.style.display = 'none';
      document.querySelector('#finding-match .player-list').style.display =
        'none';
    }

    // Reset game state
    gameState.gameId = null;
    gameState.isHost = false;
    gameState.gameMode = null;
    gameState.players = [];
    gameState.currentPlayer = null;
  }
});

// Error messages
socket.on('error', ({ message }) => {
  alert(message);
});

// Initialize the game
attachTerritoryEvents();
