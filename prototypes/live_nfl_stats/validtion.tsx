// // P2Picks Bet Validation API
// // Supports current and future bet modes with extensible architecture

// class BetValidator {
//   constructor(espnApiClient) {
//     this.espnClient = espnApiClient;
//     this.modes = {
//       'best_of_best': new BestOfBestValidator(espnApiClient),
//       'one_leg_spread': new OneLegSpreadValidator(espnApiClient),
//       'scorcerer': new ScorcererValidator(espnApiClient),
//       'horse_race': new HorseRaceValidator(espnApiClient),
//       'choose_their_fate': new ChooseTheirFateValidator(espnApiClient),
//       'sack_stack': new SackStackValidator(espnApiClient),
//       'two_minute_drill': new TwoMinuteDrillValidator(espnApiClient)
//     };
//   }

//   // Main validation entry point
//   async validateBet(betData) {
//     const { mode, gameId, config, participants } = betData;
    
//     if (!this.modes[mode]) {
//       throw new Error(`Unsupported bet mode: ${mode}`);
//     }

//     const validator = this.modes[mode];
    
//     // Get current game state
//     const gameState = await this.espnClient.getGameSummary(gameId);
    
//     // Validate bet configuration
//     const configValidation = await validator.validateConfig(config, gameState);
//     if (!configValidation.valid) {
//       return { valid: false, errors: configValidation.errors };
//     }

//     // Check if bet can still be placed (game not ended, etc.)
//     const timingValidation = validator.validateTiming(gameState, config);
//     if (!timingValidation.valid) {
//       return { valid: false, errors: timingValidation.errors };
//     }

//     return { valid: true, validator: mode };
//   }

//   // Resolve a bet once game conditions are met
//   async resolveBet(betData) {
//     const { mode, gameId, config, participants, createdAt } = betData;
//     const validator = this.modes[mode];
    
//     const gameState = await this.espnClient.getGameSummary(gameId);
//     const result = await validator.resolve(config, gameState, participants, createdAt);
    
//     return result;
//   }

//   // Check if bet should transition from Active -> Pending
//   async shouldLockBet(betData) {
//     const { mode, gameId, config, timerExpired } = betData;
//     const validator = this.modes[mode];
    
//     if (!timerExpired) return false;
    
//     const gameState = await this.espnClient.getGameSummary(gameId);
//     return validator.shouldLock(config, gameState);
//   }

//   // Check if bet can be resolved (game event completed)
//   async canResolveBet(betData) {
//     const { mode, gameId, config } = betData;
//     const validator = this.modes[mode];
    
//     const gameState = await this.espnClient.getGameSummary(gameId);
//     return validator.canResolve(config, gameState);
//   }
// }

// // Base class for all bet mode validators
// class BaseBetValidator {
//   constructor(espnClient) {
//     this.espnClient = espnClient;
//   }

//   // Override in subclasses
//   async validateConfig(config, gameState) {
//     return { valid: true, errors: [] };
//   }

//   validateTiming(gameState, config) {
//     // Default: can't bet on completed games
//     if (gameState.header.competitions[0].status.type.completed) {
//       return { valid: false, errors: ['Cannot bet on completed games'] };
//     }
//     return { valid: true, errors: [] };
//   }

//   shouldLock(config, gameState) {
//     return true; // Default: lock when timer expires
//   }

//   async canResolve(config, gameState) {
//     return gameState.header.competitions[0].status.type.completed;
//   }

//   // Helper methods
//   getGameStatus(gameState) {
//     return gameState.header.competitions[0].status;
//   }

//   getCurrentQuarter(gameState) {
//     const status = this.getGameStatus(gameState);
//     return status.period;
//   }

//   isGameComplete(gameState) {
//     return this.getGameStatus(gameState).type.completed;
//   }

//   getPlayerStats(gameState, playerId) {
//     // Navigate ESPN API structure to find player stats
//     const boxscore = gameState.boxscore;
//     if (!boxscore || !boxscore.players) return null;
    
//     for (let team of boxscore.players) {
//       for (let positionGroup of team.statistics) {
//         const player = positionGroup.athletes.find(p => p.athlete.id === playerId);
//         if (player) return player.stats;
//       }
//     }
//     return null;
//   }

//   getFinalScore(gameState) {
//     const competition = gameState.header.competitions[0];
//     const homeScore = parseInt(competition.competitors[0].score);
//     const awayScore = parseInt(competition.competitors[1].score);
//     return { home: homeScore, away: awayScore };
//   }
// }

// // Mode 1: Best of the Best
// class BestOfBestValidator extends BaseBetValidator {
//   async validateConfig(config, gameState) {
//     const { player1Id, player2Id, stat, resolveAfter } = config;
//     const errors = [];

//     // Validate players exist and are different
//     if (!player1Id || !player2Id) {
//       errors.push('Both players must be specified');
//     }
//     if (player1Id === player2Id) {
//       errors.push('Players must be different');
//     }

//     // Validate stat type
//     const validStats = ['receptions', 'receivingYards', 'touchdowns'];
//     if (!validStats.includes(stat)) {
//       errors.push(`Invalid stat: ${stat}`);
//     }

//     // Validate resolve timing
//     const validResolveAfter = ['Q1', 'Q2', 'Q3', 'Q4'];
//     if (!validResolveAfter.includes(resolveAfter)) {
//       errors.push(`Invalid resolve timing: ${resolveAfter}`);
//     }

//     // Check if players are in this game
//     const player1Stats = this.getPlayerStats(gameState, player1Id);
//     const player2Stats = this.getPlayerStats(gameState, player2Id);
    
//     if (!player1Stats) errors.push('Player 1 not found in game');
//     if (!player2Stats) errors.push('Player 2 not found in game');

//     return { valid: errors.length === 0, errors };
//   }

//   shouldLock(config, gameState) {
//     // Lock when timer expires OR when the target quarter begins
//     const currentQuarter = this.getCurrentQuarter(gameState);
//     const targetQuarter = parseInt(config.resolveAfter.replace('Q', ''));
//     return currentQuarter >= targetQuarter;
//   }

//   async canResolve(config, gameState) {
//     const currentQuarter = this.getCurrentQuarter(gameState);
//     const targetQuarter = parseInt(config.resolveAfter.replace('Q', ''));
    
//     // Can resolve when target quarter is complete OR game is complete
//     return currentQuarter > targetQuarter || this.isGameComplete(gameState);
//   }

//   async resolve(config, gameState, participants, betCreatedAt) {
//     const { player1Id, player2Id, stat } = config;
    
//     // Get baseline stats from bet creation time
//     const baselineGameState = await this.espnClient.getGameSummaryAtTime(gameState.header.id, betCreatedAt);
//     const player1Baseline = this.getStatValue(baselineGameState, player1Id, stat) || 0;
//     const player2Baseline = this.getStatValue(baselineGameState, player2Id, stat) || 0;
    
//     // Get current stats
//     const player1Current = this.getStatValue(gameState, player1Id, stat) || 0;
//     const player2Current = this.getStatValue(gameState, player2Id, stat) || 0;
    
//     // Calculate net increases
//     const player1Increase = player1Current - player1Baseline;
//     const player2Increase = player2Current - player2Baseline;
    
//     let winningChoice;
//     if (player1Increase > player2Increase) {
//       winningChoice = 'Player 1';
//     } else if (player2Increase > player1Increase) {
//       winningChoice = 'Player 2';
//     } else {
//       return { winners: [], losers: participants.filter(p => p.choice !== 'pass') }; // Tie = wash
//     }

//     const winners = participants.filter(p => p.choice === winningChoice);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== winningChoice);
    
//     return { winners, losers, details: { player1Increase, player2Increase, winningChoice } };
//   }

//   getStatValue(gameState, playerId, statType) {
//     const stats = this.getPlayerStats(gameState, playerId);
//     if (!stats) return 0;
    
//     const statMap = {
//       'receptions': 'receptions',
//       'receivingYards': 'receivingYards', 
//       'touchdowns': 'receivingTouchdowns'
//     };
    
//     return parseInt(stats[statMap[statType]]) || 0;
//   }
// }

// // Mode 2: 1 Leg Spread
// class OneLegSpreadValidator extends BaseBetValidator {
//   async validateConfig(config, gameState) {
//     // No special config needed for spread betting
//     return { valid: true, errors: [] };
//   }

//   async resolve(config, gameState, participants, betCreatedAt) {
//     const finalScore = this.getFinalScore(gameState);
//     const spread = Math.abs(finalScore.home - finalScore.away);
    
//     let winningChoice;
//     if (spread >= 0 && spread <= 3) winningChoice = '0-3';
//     else if (spread >= 4 && spread <= 10) winningChoice = '4-10';
//     else if (spread >= 11 && spread <= 25) winningChoice = '11-25';
//     else winningChoice = '26+';
    
//     const winners = participants.filter(p => p.choice === winningChoice);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== winningChoice);
    
//     return { winners, losers, details: { finalSpread: spread, winningChoice } };
//   }
// }

// // Future Mode: Scorcerer
// class ScorcererValidator extends BaseBetValidator {
//   validateTiming(gameState, config) {
//     // Can only bet during active games
//     const status = this.getGameStatus(gameState);
//     if (status.type.completed || !status.type.name.includes('IN_PROGRESS')) {
//       return { valid: false, errors: ['Can only bet during live games'] };
//     }
//     return { valid: true, errors: [] };
//   }

//   shouldLock(config, gameState) {
//     // Lock immediately when timer expires (live betting)
//     return true;
//   }

//   async canResolve(config, gameState) {
//     // Resolve when next score happens OR game ends
//     const currentScore = this.getFinalScore(gameState);
//     const initialScore = config.initialScore || { home: 0, away: 0 };
    
//     return (currentScore.home + currentScore.away) > (initialScore.home + initialScore.away) || this.isGameComplete(gameState);
//   }

//   async resolve(config, gameState, participants, betCreatedAt) {
//     // Implementation would check play-by-play data for next scoring event type
//     // This is a simplified version
//     const playByPlay = await this.espnClient.getPlayByPlay(gameState.header.id);
//     const nextScore = this.findNextScore(playByPlay, betCreatedAt);
    
//     let winningChoice;
//     if (!nextScore) winningChoice = 'No More Scores';
//     else winningChoice = nextScore.type; // 'TD', 'FG', 'Safety'
    
//     const winners = participants.filter(p => p.choice === winningChoice);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== winningChoice);
    
//     return { winners, losers, details: { nextScoreType: winningChoice } };
//   }

//   findNextScore(playByPlay, betTime) {
//     // Simplified - would need to parse ESPN play-by-play format
//     // Look for scoring plays after bet creation time
//     return null; // Placeholder
//   }
// }

// // Future Mode: Horse Race
// class HorseRaceValidator extends BaseBetValidator {
//   async validateConfig(config, gameState) {
//     const { resolveAt } = config;
//     const validResolveOptions = ['Q1_END', 'Q2_END', 'Q3_END', 'Q4_END', 'FINAL'];
    
//     if (!validResolveOptions.includes(resolveAt)) {
//       return { valid: false, errors: [`Invalid resolve timing: ${resolveAt}`] };
//     }
    
//     return { valid: true, errors: [] };
//   }

//   async resolve(config, gameState, participants, betCreatedAt) {
//     const finalScore = this.getFinalScore(gameState);
    
//     let winningChoice;
//     if (finalScore.home > finalScore.away) winningChoice = 'HOME';
//     else if (finalScore.away > finalScore.home) winningChoice = 'AWAY';
//     else winningChoice = 'TIE';
    
//     const winners = participants.filter(p => p.choice === winningChoice);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== winningChoice);
    
//     return { winners, losers, details: { finalScore, winningChoice } };
//   }
// }

// // Future Mode: Choose Their Fate
// class ChooseTheirFateValidator extends BaseBetValidator {
//   validateTiming(gameState, config) {
//     // Only valid during active possessions
//     const status = this.getGameStatus(gameState);
//     if (!status.type.name.includes('IN_PROGRESS')) {
//       return { valid: false, errors: ['Can only bet during active possessions'] };
//     }
//     return { valid: true, errors: [] };
//   }

//   async resolve(config, gameState, participants, betCreatedAt) {
//     // Would analyze play-by-play to determine possession outcome
//     const possessionResult = await this.analyzePossessionOutcome(gameState, betCreatedAt);
    
//     const winners = participants.filter(p => p.choice === possessionResult);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== possessionResult);
    
//     return { winners, losers, details: { possessionOutcome: possessionResult } };
//   }

//   async analyzePossessionOutcome(gameState, betTime) {
//     // Simplified - would need detailed play analysis
//     return 'TD'; // Placeholder
//   }
// }

// // Future Mode: Sack Stack  
// class SackStackValidator extends BaseBetValidator {
//   async resolve(config, gameState, participants, betCreatedAt) {
//     const baselineStats = await this.espnClient.getGameSummaryAtTime(gameState.header.id, betCreatedAt);
//     const baselineSacks = this.getTotalSacks(baselineStats);
//     const currentSacks = this.getTotalSacks(gameState);
    
//     const sacksDuringBet = currentSacks - baselineSacks;
    
//     let winningChoice;
//     if (sacksDuringBet <= 1) winningChoice = '0-1';
//     else if (sacksDuringBet <= 4) winningChoice = '2-4';  
//     else winningChoice = '5+';
    
//     const winners = participants.filter(p => p.choice === winningChoice);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== winningChoice);
    
//     return { winners, losers, details: { totalSacks: sacksDuringBet, winningChoice } };
//   }

//   getTotalSacks(gameState) {
//     // Extract total sacks from both teams
//     const boxscore = gameState.boxscore;
//     if (!boxscore) return 0;
    
//     let totalSacks = 0;
//     // Implementation would parse team defensive stats
//     return totalSacks;
//   }
// }

// // Future Mode: Two-Minute Drill
// class TwoMinuteDrillValidator extends BaseBetValidator {
//   async validateConfig(config, gameState) {
//     const { period } = config; // 'HALF' or 'GAME'
    
//     if (!['HALF', 'GAME'].includes(period)) {
//       return { valid: false, errors: [`Invalid period: ${period}`] };
//     }
    
//     return { valid: true, errors: [] };
//   }

//   async resolve(config, gameState, participants, betCreatedAt) {
//     const { period } = config;
//     const scoredInFinalTwoMinutes = await this.checkFinalTwoMinuteScoring(gameState, period);
    
//     const winningChoice = scoredInFinalTwoMinutes ? 'YES' : 'NO';
//     const winners = participants.filter(p => p.choice === winningChoice);
//     const losers = participants.filter(p => p.choice !== 'pass' && p.choice !== winningChoice);
    
//     return { winners, losers, details: { scoredInFinalTwo: scoredInFinalTwoMinutes } };
//   }

//   async checkFinalTwoMinuteScoring(gameState, period) {
//     // Would analyze play-by-play for scoring in final 2 minutes of specified period
//     return false; // Placeholder
//   }
// }

// // Mock ESPN API Client for reference
// class ESPNApiClient {
//   async getGameSummary(gameId) {
//     // Return game summary data structure
//     return {};
//   }

//   async getGameSummaryAtTime(gameId, timestamp) {
//     // Return historical game state at specific time
//     return {};
//   }

//   async getPlayByPlay(gameId) {
//     // Return detailed play-by-play data
//     return {};
//   }
// }

// // Export the main validator
// module.exports = { BetValidator, ESPNApiClient };

// // Usage Example:
// /*
// const validator = new BetValidator(new ESPNApiClient());

// const betData = {
//   mode: 'best_of_best',
//   gameId: '401547439',
//   config: {
//     player1Id: '12345',
//     player2Id: '67890', 
//     stat: 'receivingYards',
//     resolveAfter: 'Q2'
//   },
//   participants: [
//     { userId: 'user1', choice: 'Player 1', wager: 10 },
//     { userId: 'user2', choice: 'Player 2', wager: 10 }
//   ]
// };

// // Validate bet creation
// const validation = await validator.validateBet(betData);

// // Check if should lock
// const shouldLock = await validator.shouldLockBet(betData);

// // Resolve bet
// const result = await validator.resolveBet(betData);
// */