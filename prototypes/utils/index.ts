// index.ts - Our main file to run the validator

import { validateGameData } from './boxscoreValidator.js';

// A minimal, simplified piece of data to test the validator
const sampleBoxscoreData = {
  boxscore: {
    teams: [
      {
        team: { id: '1', uid: '1', slug: 'away-team', location: 'Away', name: 'Team', abbreviation: 'AWY', displayName: 'Away Team', shortDisplayName: 'Away', color: 'ffffff', alternateColor: '000000', logo: 'url' },
        statistics: [],
        displayOrder: 1,
        homeAway: 'away'
      },
      {
        team: { id: '2', uid: '2', slug: 'home-team', location: 'Home', name: 'Team', abbreviation: 'HME', displayName: 'Home Team', shortDisplayName: 'Home', color: 'ffffff', alternateColor: '000000', logo: 'url' },
        statistics: [],
        displayOrder: 2,
        homeAway: 'home'
      }
    ],
    players: [
      {
        team: { id: '1', uid: '1', slug: 'away-team', location: 'Away', name: 'Team', abbreviation: 'AWY', displayName: 'Away Team', shortDisplayName: 'Away', color: 'ffffff', alternateColor: '000000', logo: 'url' },
        statistics: [],
        displayOrder: 1
      },
      {
        team: { id: '2', uid: '2', slug: 'home-team', location: 'Home', name: 'Team', abbreviation: 'HME', displayName: 'Home Team', shortDisplayName: 'Home', color: 'ffffff', alternateColor: '000000', logo: 'url' },
        statistics: [],
        displayOrder: 2
      }
    ]
  }
};

// Run the validation
const result = validateGameData(sampleBoxscoreData);

// Print the result to the console
console.log('Validation Result:');
if (result.isValid) {
  console.log('✅ Data is valid!');
  console.log('Extracted Player Stats:', result.players);
} else {
  console.error('❌ Data is invalid!');
  console.error('Errors:', result.errors);
}