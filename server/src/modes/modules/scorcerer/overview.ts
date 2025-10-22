import type { ModeOverview } from '../../shared/types';

export const scorcererOverview: ModeOverview = {
  key: 'scorcerer',
  label: 'Scorcerer',
  tagline: 'Call the next scoring play.',
  description:
    'Scorcerer looks ahead to the next scoring event. The table predicts what kind of score happens next, whether it is offensive, defensive, or special teams.',
  proposerConfiguration: [
    'No additional setup beyond the usual wager, timer, and game selection.'
  ],
  participantChoices: [
    'pass — observe without risking points.',
    'TD — any touchdown, including defensive or special teams returns.',
    'FG — a made field goal on the next scoring drive.',
    'Safety — the defense records a safety.',
    'No More Scores — the game ends without another scoring play.'
  ],
  winningCondition:
    'Whatever score happens next determines the winning choice. If the clock runs out with no additional scoring, No More Scores pays out; if a different outcome occurs first, that option wins.',
  notes: [
    'Defensive and special teams touchdowns count as TD.',
    'Missed kicks and turnovers do not decide the bet; only completed scoring plays count.'
  ],
  example: {
    title: 'Example',
    description:
      'The next possession results in a 48-yard field goal. Everyone on FG wins, while other selections lose their wager.'
  }
};
