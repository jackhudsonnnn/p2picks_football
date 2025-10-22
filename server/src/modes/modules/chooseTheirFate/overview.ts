import type { ModeOverview } from '../../shared/types';

export const chooseTheirFateOverview: ModeOverview = {
  key: 'choose_their_fate',
  label: 'Choose Their Fate',
  tagline: 'Predict how the current drive ends.',
  description:
    'Choose Their Fate zeroes in on the live drive. The table bets on what happens next, wagering on the offense closing the series with points or giving the ball away.',
  proposerConfiguration: [
    'No extra setup beyond the standard wager, timer, and game selection.'
  ],
  participantChoices: [
    'pass — watch without joining.',
    'Touchdown — the drive results in a touchdown.',
    'Field Goal — the drive ends with a made field goal.',
    'Safety — the offense gets tackled in its own end zone.',
    'Turnover — any turnover (interception, fumble lost, or turnover on downs).'
  ],
  winningCondition:
    'Once the drive concludes, the outcome determines the winning choice. If the drive stalls without points but is not a turnover (e.g., punt), the bet washes.',
  notes: [
    'This mode is only available while the selected game is in progress so a live drive can be tracked.'
  ],
  example: {
    title: 'Example',
    description:
      'The offense throws an interception on the next play. Everyone who picked Turnover wins the pot.'
  }
};
