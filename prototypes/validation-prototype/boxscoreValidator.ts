// ESPN NFL Boxscore Data Structure Analysis & Validation

// ============================================================================
// DATA STRUCTURE ANALYSIS
// ============================================================================

/*
BOXSCORE STRUCTURE:
{
  boxscore: {
    teams: Team[],     // Always 2 teams (away, home)
    players: Team[]    // Same 2 teams with detailed player stats
  }
}

TEAM STRUCTURE (in both teams and players arrays):
- team: TeamInfo
- statistics: Statistic[] (team-level stats)
- displayOrder: number (1 or 2)
- homeAway: "home" | "away"

PLAYER STRUCTURE (only in players array):
- team: TeamInfo
- statistics: PlayerStatCategory[]
- displayOrder: number

KEY PATTERNS IDENTIFIED:
1. Values can be numbers, strings, or "-" for missing data
2. Some stats use compound formats like "14/17", "3-5", "2-20"
3. Player stats are grouped by category (passing, rushing, receiving, etc.)
4. Each category has keys[], labels[], descriptions[], athletes[], and totals[]
5. Team info is consistent across both arrays but players array has detailed breakdowns
*/

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TeamInfo {
  id: string;
  uid: string;
  slug: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  color: string;
  alternateColor: string;
  logo: string;
}

interface TeamStatistic {
  name: string;
  displayValue: string;
  value: number | string; // Can be number, "-", or compound strings
  label: string;
}

interface PlayerLink {
  rel: string[];
  href: string;
  text: string;
}

interface PlayerHeadshot {
  href: string;
  alt: string;
}

interface Athlete {
  id: string;
  uid: string;
  guid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  links: PlayerLink[];
  headshot?: PlayerHeadshot; // Optional - some players don't have headshots
  jersey: string;
}

interface PlayerStatEntry {
  athlete: Athlete;
  stats: string[]; // Array of stat values as strings
}

interface PlayerStatCategory {
  name: string;
  keys: string[];
  text: string;
  labels: string[];
  descriptions: string[];
  athletes: PlayerStatEntry[];
  totals: string[];
}

interface TeamData {
  team: TeamInfo;
  statistics: TeamStatistic[];
  displayOrder: 1 | 2;
  homeAway: "home" | "away";
}

interface PlayerData {
  team: TeamInfo;
  statistics: PlayerStatCategory[];
  displayOrder: 1 | 2;
}

interface NFLBoxscore {
  boxscore: {
    teams: [TeamData, TeamData]; // Always exactly 2 teams
    players: [PlayerData, PlayerData]; // Always exactly 2 teams
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

class BoxscoreValidationError extends Error {
  constructor(message: string, path?: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'BoxscoreValidationError';
  }
}

function validateTeamInfo(team: any, path: string): TeamInfo {
  if (!team || typeof team !== 'object') {
    throw new BoxscoreValidationError('Team info must be an object', path);
  }

  const required = ['id', 'uid', 'slug', 'location', 'name', 'abbreviation', 
                   'displayName', 'shortDisplayName', 'color', 'alternateColor', 'logo'];
  
  for (const field of required) {
    if (typeof team[field] !== 'string') {
      throw new BoxscoreValidationError(`${field} must be a string`, `${path}.${field}`);
    }
  }

  return team as TeamInfo;
}

function validateTeamStatistic(stat: any, path: string): TeamStatistic {
  if (!stat || typeof stat !== 'object') {
    throw new BoxscoreValidationError('Statistic must be an object', path);
  }

  if (typeof stat.name !== 'string') {
    throw new BoxscoreValidationError('name must be a string', `${path}.name`);
  }
  if (typeof stat.displayValue !== 'string') {
    throw new BoxscoreValidationError('displayValue must be a string', `${path}.displayValue`);
  }
  if (typeof stat.label !== 'string') {
    throw new BoxscoreValidationError('label must be a string', `${path}.label`);
  }

  // Value can be number, string, or "-"
  if (typeof stat.value !== 'number' && typeof stat.value !== 'string') {
    throw new BoxscoreValidationError('value must be number or string', `${path}.value`);
  }

  return stat as TeamStatistic;
}

function validateAthlete(athlete: any, path: string): Athlete {
  if (!athlete || typeof athlete !== 'object') {
    throw new BoxscoreValidationError('Athlete must be an object', path);
  }

  const required = ['id', 'uid', 'guid', 'firstName', 'lastName', 'displayName', 'jersey'];
  for (const field of required) {
    if (typeof athlete[field] !== 'string') {
      throw new BoxscoreValidationError(`${field} must be a string`, `${path}.${field}`);
    }
  }

  if (!Array.isArray(athlete.links)) {
    throw new BoxscoreValidationError('links must be an array', `${path}.links`);
  }

  // Headshot is optional
  if (athlete.headshot && (!athlete.headshot.href || !athlete.headshot.alt)) {
    throw new BoxscoreValidationError('headshot must have href and alt', `${path}.headshot`);
  }

  return athlete as Athlete;
}

function validatePlayerStatCategory(category: any, path: string): PlayerStatCategory {
  if (!category || typeof category !== 'object') {
    throw new BoxscoreValidationError('Category must be an object', path);
  }

  // Required string fields
  const stringFields = ['name', 'text'];
  for (const field of stringFields) {
    if (typeof category[field] !== 'string') {
      throw new BoxscoreValidationError(`${field} must be a string`, `${path}.${field}`);
    }
  }

  // Required array fields
  const arrayFields = ['keys', 'labels', 'descriptions', 'totals'];
  for (const field of arrayFields) {
    if (!Array.isArray(category[field])) {
      throw new BoxscoreValidationError(`${field} must be an array`, `${path}.${field}`);
    }
  }

  // Validate athletes array
  if (!Array.isArray(category.athletes)) {
    throw new BoxscoreValidationError('athletes must be an array', `${path}.athletes`);
  }

  category.athletes.forEach((athleteEntry: any, index: number) => {
    const entryPath = `${path}.athletes[${index}]`;
    
    if (!athleteEntry.athlete) {
      throw new BoxscoreValidationError('Missing athlete', `${entryPath}.athlete`);
    }
    
    validateAthlete(athleteEntry.athlete, `${entryPath}.athlete`);
    
    if (!Array.isArray(athleteEntry.stats)) {
      throw new BoxscoreValidationError('stats must be an array', `${entryPath}.stats`);
    }
    
    // All stats should be strings
    athleteEntry.stats.forEach((stat: any, statIndex: number) => {
      if (typeof stat !== 'string') {
        throw new BoxscoreValidationError('All stats must be strings', `${entryPath}.stats[${statIndex}]`);
      }
    });
  });

  return category as PlayerStatCategory;
}

function validateTeamData(teamData: any, path: string, isPlayerData = false): TeamData | PlayerData {
  if (!teamData || typeof teamData !== 'object') {
    throw new BoxscoreValidationError('Team data must be an object', path);
  }

  // Validate team info
  validateTeamInfo(teamData.team, `${path}.team`);

  // Validate statistics array
  if (!Array.isArray(teamData.statistics)) {
    throw new BoxscoreValidationError('statistics must be an array', `${path}.statistics`);
  }

  // Different validation for team vs player statistics
  if (isPlayerData) {
    teamData.statistics.forEach((category: any, index: number) => {
      validatePlayerStatCategory(category, `${path}.statistics[${index}]`);
    });
  } else {
    teamData.statistics.forEach((stat: any, index: number) => {
      validateTeamStatistic(stat, `${path}.statistics[${index}]`);
    });
  }

  // Validate displayOrder
  if (teamData.displayOrder !== 1 && teamData.displayOrder !== 2) {
    throw new BoxscoreValidationError('displayOrder must be 1 or 2', `${path}.displayOrder`);
  }

  // Validate homeAway (only for team data, not player data)
  if (!isPlayerData) {
    if (teamData.homeAway !== 'home' && teamData.homeAway !== 'away') {
      throw new BoxscoreValidationError('homeAway must be "home" or "away"', `${path}.homeAway`);
    }
  }

  return teamData;
}

function validateNFLBoxscore(data: any): NFLBoxscore {
  if (!data || typeof data !== 'object') {
    throw new BoxscoreValidationError('Data must be an object');
  }

  if (!data.boxscore || typeof data.boxscore !== 'object') {
    throw new BoxscoreValidationError('boxscore must be an object', 'boxscore');
  }

  const { boxscore } = data;

  // Validate teams array
  if (!Array.isArray(boxscore.teams) || boxscore.teams.length !== 2) {
    throw new BoxscoreValidationError('teams must be an array with exactly 2 elements', 'boxscore.teams');
  }

  // Validate players array
  if (!Array.isArray(boxscore.players) || boxscore.players.length !== 2) {
    throw new BoxscoreValidationError('players must be an array with exactly 2 elements', 'boxscore.players');
  }

  // Validate each team
  boxscore.teams.forEach((team: any, index: number) => {
    validateTeamData(team, `boxscore.teams[${index}]`, false);
  });

  // Validate each player data
  boxscore.players.forEach((playerData: any, index: number) => {
    validateTeamData(playerData, `boxscore.players[${index}]`, true);
  });

  // Ensure we have one home and one away team
  const homeAwayValues = boxscore.teams.map((t: any) => t.homeAway);
  if (!homeAwayValues.includes('home') || !homeAwayValues.includes('away')) {
    throw new BoxscoreValidationError('Must have exactly one home and one away team', 'boxscore.teams');
  }

  // Ensure display orders are 1 and 2
  const displayOrders = boxscore.teams.map((t: any) => t.displayOrder);
  if (!displayOrders.includes(1) || !displayOrders.includes(2)) {
    throw new BoxscoreValidationError('Display orders must be 1 and 2', 'boxscore.teams');
  }

  return data as NFLBoxscore;
}

// ============================================================================
// UTILITY FUNCTIONS FOR P2PICKS
// ============================================================================

interface PlayerStats {
  playerId: string;
  name: string;
  team: string;
  receptions?: number;
  receivingYards?: number;
  receivingTouchdowns?: number;
  rushingYards?: number;
  rushingTouchdowns?: number;
}

function extractPlayerStats(boxscore: NFLBoxscore): PlayerStats[] {
  const players: PlayerStats[] = [];

  boxscore.boxscore.players.forEach(teamData => {
    const teamAbbr = teamData.team.abbreviation;
    
    // Find receiving stats
    const receivingStats = teamData.statistics.find(cat => cat.name === 'receiving');
    if (receivingStats) {
      receivingStats.athletes.forEach(athleteEntry => {
        const athlete = athleteEntry.athlete;
        const stats = athleteEntry.stats;
        
        // Parse receiving stats: [REC, YDS, AVG, TD, LONG, TGTS]
        const getNum = (i: number) => {
          const v = stats[i];
          if (v === undefined || v === '-' || v === '') return 0;
          const n = parseInt(v, 10);
            return Number.isNaN(n) ? 0 : n;
        };
        const player: PlayerStats = {
          playerId: athlete.id,
          name: athlete.displayName,
          team: teamAbbr,
          receptions: getNum(0),
          receivingYards: getNum(1),
          receivingTouchdowns: getNum(3)
        };
        
        players.push(player);
      });
    }

    // Find rushing stats and merge with existing players or create new entries
    const rushingStats = teamData.statistics.find(cat => cat.name === 'rushing');
    if (rushingStats) {
      rushingStats.athletes.forEach(athleteEntry => {
        const athlete = athleteEntry.athlete;
        const stats = athleteEntry.stats;
        
        let existingPlayer = players.find(p => p.playerId === athlete.id);
        if (existingPlayer) {
          // Merge rushing stats: [CAR, YDS, AVG, TD, LONG]
          const getNum = (i: number) => {
            const v = stats[i];
            if (v === undefined || v === '-' || v === '') return 0;
            const n = parseInt(v, 10);
            return Number.isNaN(n) ? 0 : n;
          };
          existingPlayer.rushingYards = getNum(1);
          existingPlayer.rushingTouchdowns = getNum(3);
        } else {
          // Create new player entry
          const getNum = (i: number) => {
            const v = stats[i];
            if (v === undefined || v === '-' || v === '') return 0;
            const n = parseInt(v, 10);
            return Number.isNaN(n) ? 0 : n;
          };
          const player: PlayerStats = {
            playerId: athlete.id,
            name: athlete.displayName,
            team: teamAbbr,
            rushingYards: getNum(1),
            rushingTouchdowns: getNum(3)
          };
          players.push(player);
        }
      });
    }
  });

  return players;
}

function getTeamStats(boxscore: NFLBoxscore): { home: TeamData; away: TeamData } {
  const teams = boxscore.boxscore.teams;
  const homeTeam = teams.find(t => t.homeAway === 'home')!;
  const awayTeam = teams.find(t => t.homeAway === 'away')!;
  
  return { home: homeTeam, away: awayTeam };
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

// Example usage for P2Picks validation
function validateGameData(rawData: any): { 
  isValid: boolean; 
  errors: string[]; 
  data?: NFLBoxscore;
  players?: PlayerStats[];
} {
  const errors: string[] = [];
  
  try {
    const validatedData = validateNFLBoxscore(rawData);
    const playerStats = extractPlayerStats(validatedData);
    
    return {
      isValid: true,
      errors: [],
      data: validatedData,
      players: playerStats
    };
  } catch (error) {
    if (error instanceof BoxscoreValidationError) {
      errors.push(error.message);
    } else {
      errors.push('Unknown validation error');
    }
    
    return {
      isValid: false,
      errors
    };
  }
}

// Export for use in P2Picks application
export type { NFLBoxscore, PlayerStats };
export {
  validateNFLBoxscore,
  validateGameData,
  extractPlayerStats,
  getTeamStats,
  BoxscoreValidationError
};

// ============================================================================
// STAT CATEGORIES REFERENCE
// ============================================================================

/*
OBSERVED STAT CATEGORIES:
- passing: [C/ATT, YDS, AVG, TD, INT, SACKS, RTG]
- rushing: [CAR, YDS, AVG, TD, LONG]
- receiving: [REC, YDS, AVG, TD, LONG, TGTS]
- fumbles: [FUM, LOST, REC]
- defensive: [TOT, SOLO, SACKS, TFL, PD, QB HTS, TD]
- interceptions: [INT, YDS, TD]
- kickReturns: [NO, YDS, AVG, LONG, TD]
- puntReturns: [NO, YDS, AVG, LONG, TD]
- kicking: [FG, PCT, LONG, XP, PTS]
- punting: [NO, YDS, AVG, TB, In 20, LONG]
*/