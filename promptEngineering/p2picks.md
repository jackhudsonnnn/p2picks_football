# P2Picks: Core Logic & Game Flow

### Introduction
P2Picks is a peer-to-peer, democratized sports betting application built with a React frontend and Supabase backend. The platform uses a points-based system instead of real money. The core gameplay loop revolves around users proposing bets within private group chats (called **"Tables"**), where other members can then participate.

### Key Principles
* **Peer-to-Peer (P2P):** Bets are proposed by users to other users within a Table. The proposer can participate in their own bet, as they hold no inherent advantage.
* **Anonymity:** While a bet is active, participants' choices are hidden from other users. However, users can see the point balances of others in their Table, which may indirectly reveal outcomes after a bet becomes resolved.
* **Dynamic Choices:** Participants can change their selection at any time while their ticket is active.
* **Data Source:** Game and player data is sourced from an unofficial ESPN API.

---

### The Bet Lifecycle & States
A bet progresses through several states from its creation to its completion.

1.  **Proposal:** Any user can initiate a bet by selecting parameters. This posts the bet to their Table.
2.  **Participation (`Active` State):** Once proposed, the bet's timer begins. While the timer is running, the bet is **`Active`**. Members can join, and participants can change their choices.
3.  **Lock-in (`Pending` State):** When the timer expires, choices are locked in. If the underlying game event is not yet complete, the bet is now **`Pending`**.
4.  **Resolution (`Resolved` State):** Once the game event concludes, the bet is validated and either paid out or washed. The bet's state is now **`Resolved`**.
5.  **Washed (`Washed` State):** If a bet meets wash conditions (zero participants, all user choose same option, or no winners), it transitions to **`Washed`**. A system message is emitted.

---

### Payout Structure
The platform uses a pooled betting structure where winners split the losers' contributions.

* **The "Losers' Pot":** The sum of wagers from all losing participants.
    * *Example:* If a bet has a **10-point wager**, and **3 users lose**, the losers' pot is $3 \times 10 = 30$ points.
* **Winner Payout:** The losers' pot is split evenly among all winners.
    * *Example (cont):* If **2 users win**, they each receive $30 \div 2 = 15$ points.
* **Uneven Splits:** If the pot does not split evenly, the remaining points are distributed randomly, one by one, to the winners until the remainder is zero.
    * *Example:* If a **50-point losers pot** is split among **3 winners**, each gets 16 points ($3 \times 16 = 48$). The remaining **2 point** are distributed amongst the three winners at random.
* **Edge Cases:** A bet is considered a **"wash"** (i.e., nullified, as if it never happened) under the following conditions. In these cases, no points are won or lost.
* The timer expires with zero participants
* The timer expires and all participants chose `No Entry`
* The timer expires and all participants chose the same option
* The bet is resolved and no one chose the winning option

Implementation notes (server-first):
- Active → Pending flips are performed server-side.
- System messages for `pending`, `resolved`, and `washed` are emitted by database triggers.
- Server is the source of truth.

---

### NFL Modes

#### Mode 1: Either Or
This mode is a prop bet comparing the performance of two players.
* **Proposer Configuration:**
    * Selects the **stat** to compare: Receptions, Receiving Yards, Punts, ...
    * Selects **two unique players** from the active game.
    * Selects when the bet should **resolve after**: Halftime or End of Game.
    * Selects how the validator should **Track Progress**: Cumulative or Starting Now
* **Participant Choices:** `No Entry`, `{Player 1}`, `{Player 2}`.
* **Winning Condition:** The winning choice is the player who achieves the **largest** (in the case of "Cumulative") or **largest increase** in the selected stat from the moment the bet becomes pending (in the case of "Starting Now") until the "settle at" time.

#### Mode 2: King Of The Hill
Race two players to a stat milestone.
* **Proposer Configuration:**
    * Selects the **stat** to compare: Receptions, Receiving Yards, Punts, ...
    * Selects **two unique players** from the active game.
    * Selects how the validator should **Track Progress**: Cumulative or Starting Now
    * Sets a **resolve value** between `0` and `499`; this is the target both players are racing to hit.
* **Participant Choices:** `No Entry`, `{Player 1}`, `{Player 2}`, `Neither`.
* **Winning Condition:** As the game progresses the validator watches the tracked stat. The first player to reach or exceed the resolve value (whether it starts from the start of the game or time of the bet closing, decided by the **Track Progress** configuration) wins. If the game reaches its final state before either player hits the target, `Neither` wins.
* **Edge Cases:** The wager washes if the resolve value has already been met before the bet becomes pending or if both players cross the threshold on the same update.

#### Mode 3: Choose their Fate
This mode is a bet on the current drive outcome.
* **Proposer Configuration:** None beyond the standard bet parameters.
* **Participant Choices:** `No Entry`, `Touchdown`, `Field Goal`, `Safety`, `Punt`, `Turnover`.
* **Winning Condition:** The winning choice reflects how the drive ends. 
* **Edge Cases:** The wager washes if the drive ends scoreless without a punt or turnover (e.g., end of half/game).


#### Mode 4: Scorcerer
This mode is a bet on the next score type.
* **Proposer Configuration:** None beyond the standard bet parameters.
* **Participant Choices:** `No Entry`, `TD`, `FG`, `Safety`, `No More Scores`.
* **Winning Condition:** The winning choice is the type of the next score.

#### Mode 9: Score Sorcerer
This mode is a bet on which **team** scores next.
* **Proposer Configuration:** None beyond the standard bet parameters.
* **Participant Choices:** `No Entry`, `{Home Team}`, `{Away Team}`, `No More Scores`.
* **Winning Condition:** The first team to add points after the bet locks wins. If the game reaches its final state without any additional scoring, `No More Scores` wins. If both teams’ scores increase on the same update, the bet is washed.

#### Mode 5: Total Disaster
Bet on whether the total points scored in the game will be over or under a specified value.
* **Proposer Configuration:** 
    * Sets the over/under value (a numeric line, e.g. `47.5`).
    * Selects when the bet should **resolve after**: Halftime or End of Game.
* **Participant Choices:** `No Entry`, `Over`, `Under`.
* **Winning Condition:** Once the game is final, compute total points = homeScore + awayScore.
    * If total points > line, `Over` wins.
    * If total points < line, `Under` wins.

#### Mode 6: Spread The Wealth
Bet on which team covers a specified point spread, applied to the home team.
* **Proposer Configuration:** 
    * Sets the point spread (a numeric value that must end in .5). A spread is applied to the home teams score; the highest of the two scores wins/covers.
    * Selects when the bet should **resolve after**: Halftime or End of Game.
* **Participant Choices:** `No Entry`, `{team 1}`, `{team 2}`
* **Winning Condition:** Once the game is final, add the spread to the home team
    * If {team 1 score} + spread > {team 2 score}, bet participants choosing {team 1} win
    * If {team 1 score} + spread < {team 2 score}, bet participants choosing {team 2} win

#### Mode 7: Prop Hunt
This mode is a prop bet for users to guess over/under on whether a player will get more/less than a specified amount for a given stat.
* **Proposer Configuration:**
    * Selects the **stat** to compare: Receptions, Receiving Yards, Punts, ...
    * Selects **one unique player**.
    * Selects when the bet should **resolve after**: Halftime or End of Game.
    * Selects how the validator should **Track Progress**: Cumulative or Starting Now
    * Sets the over/under value, a numeric **line** (a numeric value that must end in .5).
* **Participant Choices:** `No Entry`, `over`, `under`.
* **Winning Condition:** The winning choice is decided by whether the player gets more/less than the specified amount for a given stat.

#### Mode 8: Right On The Money
Classic moneyline — pick who wins the game.
* **Proposer Configuration:** None beyond selecting the game; team names are auto-filled when available.
* **Participant Choices:** `No Entry`, `{Home Team}`, `{Away Team}`, `Tie`.
* **Winning Condition:** Once the game is final, the side with the higher score wins. If the home and away scores are equal at final, `Tie` wins.
* **Edge Cases:**
    * Bets only resolve after the game status is final. If final scores are unavailable or the game is canceled, the bet will be washed.
    * If both teams end with the same score, `Tie` is the winning option.


---

### NBA Modes
To be planned...

### MLB Modes
To be planned...

### NHL Modes
To be planned...

### NCAAF Modes
To be planned...

### U2Pick Modes

#### Custom
User-defined bet with no preset game tie-in.
* **Proposer Configuration:** Winning Condition text explaining Options list
    * Writes a **Win Condition** to describe what is being wagered on
    * Writes an **Options List** for participants to choose from
* **Participant Choices:** `No Entry`, `{option 1}`, `{option 2}`, ..., `{option n}`.
* **Winning Condition:**  Any participant can resolve via the resolve icon; choose the winning option or wash. The bet washes if no one picked the winning option.

---

### Table & Session Settlement
This feature provides a mechanism for a Table to "cash out" and end a session.

* **The Host:** The **Host** is the user who created the Table. They are responsible for settling the session.
* **Settlement Process:** The Host is given the option to **Settle the Table** once all bets within it are **`Resolved`**. This manual action finalizes the session for all members.
* **Effects of Settlement:**
    * **Score Reset:** All members' point balances in the Table are reset to `0`.
    * **Final Ledger:** A summary is posted as a system message to the Table's chat. This ledger serves as the official record for any real-world transactions the group chooses to make.

#### Example Settlement Ledger:

> **Table Settlement Summary**
> **Host:** 
> * `Chris_P_Bacon`: -20 points
>
> **Winners (To Receive from Host):**
> * `BallIzLife`: +230 points
> * `Al_Kaholic`: +55 points
>
> **Losers (To Pay Host):**
> * `WontonJohn`: -175 points
> * `Anita_Bath`: -90 points