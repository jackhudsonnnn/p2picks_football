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

1.  **Proposal:** Any usercan initiate a bet by selecting parameters. This posts the bet to their Table.
2.  **Participation (`Active` State):** Once proposed, the bet's timer begins. While the timer is running, the bet is **`Active`**. Members can join, and participants can change their choices.
3.  **Lock-in (`Pending` State):** When the timer expires, choices are locked in. If the underlying game event is not yet complete, the bet is now **`Pending`**.
4.  **Resolution (`Resolved` State):** Once the game event concludes, the bet is validated and either paid out or washed. The bet's state is now **`Resolved`**.

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
* The timer expires and all participants chose 'pass'
* The timer expires and all participants chose the same option
* The bet is resolved and no one chose the winning option

---

### Modes

#### Mode 1: Best of the Best
This mode is a prop bet comparing the performance of two players.

* **Proposer Configuration:**
    * Selects **two unique players** (WR, TE, or RB).
    * Selects the **stat** to compare: Receptions, Receiving Yards, or Touchdowns.
    * Selects when the bet should **settle at**: End of Q1, Q2, Q3, or Final.
* **Participant Choices:** `pass`, `Player 1`, `Player 2`.
* **Winning Condition:** The winning choice is the player who achieves the **largest net increase** in the selected stat from the moment the bet is placed until the "settle at" time.

#### Mode 2: 1 Leg Spread
This mode is a bet on the final point spread of a game.

* **Proposer Configuration:** None beyond the standard bet parameters.
* **Participant Choices:** `pass`, `0-3`, `4-10`, `11-25`, `26+`.
* **Winning Condition:** The winning choice is the range (inclusive) that includes the final, absolute point difference of the game score. All ranges are inclusive.
    * *Example:* If the final score is 30-24, the spread is $|30 - 24| = 6$. The winning choice is **'4-10'**.

---

### Table & Session Settlement
This feature provides a mechanism for a Table to "cash out" and end a session.

* **The Host:** The **Host** is the user who created the Table. They are responsible for settling the session.
* **Settlement Process:** The Host is given the option to **Settle the Table** once all bets within it are **`Resolved`**. This manual action finalizes the session for all members.
* **Effects of Settlement:**
    * **Score Reset:** All members' point balances in the Table are reset to `0`.
    * **Final Ledger:** A summary is posted as a system message to the Table's chat. This ledger serves as the official record for any real-world transactions the group chooses to make.

#### Example Settlement Ledger:

> **Table Settlement Summary - August 10, 2025**
> **Host:** `Chris_P_Bacon`: -20 points
>
> **Winners (To Receive from Host):**
> * `Jenna_Tulls`: +230 points
> * `Al_Kaholic`: +55 points
>
> **Losers (To Pay Host):**
> * `Chris_P_Bacon (Host)`: -175 points
> * `Anita_Bath`: -90 points