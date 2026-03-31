
function playBeep(duration_sec) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain(); // To control volume

    oscillator.type = 'sine'; // Or 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz (A4)
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); // Set volume (0 to 1)

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration_sec);
}

class QuaternityPlayerTimeCounter {
    constructor(time_sec, additionPerRound_sec) {
        this.onGame = true;
        this._remainingTime_ms = time_sec * 1000.0;
        this._additionPerRound_ms = additionPerRound_sec * 1000.0;
    }
    SetRemainingTime_ms(t) {
        this._remainingTime_ms = t;
    }
    RemainingTime_ms() {
        return this._remainingTime_ms;
    }
    OnMoveDone(elapsedTime_ms) {
        return this._DoAdvanceTime_ms(elapsedTime_ms, this._additionPerRound_ms);
    }
    SubtractTime(elapsedTime_ms) {
        return this._DoAdvanceTime_ms(elapsedTime_ms, 0);
    }
    _DoAdvanceTime_ms(subtraction_ms, addition_ms) {
        if (this._remainingTime_ms > subtraction_ms) {
            this._remainingTime_ms -= subtraction_ms;
            this._remainingTime_ms += addition_ms;
        } else {
            this._remainingTime_ms = 0;
        }
        return this._remainingTime_ms;
    }
}

function PlayerName(playerIdx) {
    switch(playerIdx) {
        case 0: return "White";
        case 1: return "Red";
        case 2: return "Black";
        case 3: return "Green";
        default: return "Invalid player";
    }
}

class RecoverableGameState {
    constructor(playerTimeCounterArr, turnIdx) {
        this.players = [];
        for (let p of playerTimeCounterArr) {
            this.players.push({
                onGame: p.onGame,
                remainingTime_ms: p.RemainingTime_ms()
            });
        }
        this.playerIdx = turnIdx;
    }
}

const GameEvents = Object.freeze({
    PLAYER_MOVED: 'PLAYER_MOVED',
    PLAYER_SPENT_TIME: 'PLAYER_SPENT_TIME',
    PLAYER_LOST_BY_TIMEOUT: 'PLAYER_LOST_BY_TIMEOUT',
    CHECKMATE: 'CHECKMATE',
    RESIGNATION: 'RESIGNATION'
});


class QuaternityGameHistory {

    constructor(initialState) {
        this._movesHistory = [];
        this._statesHistory = [initialState];
    }

    CurrentPlayerIdx() {
        return this._statesHistory.at(-1).playerIdx;
    }

    CurrentPlayerName() {
        return PlayerName(this.CurrentPlayerIdx());
    }

    RegisterPlayerMove(newState) {
        const state = this._statesHistory.at(-1);
        //if (state.players.at(state.playerIdx).onGame) {
        const txt = `${this.CurrentPlayerName()} -> ${PlayerName(newState.playerIdx)}`;
        this._pushMove(txt, GameEvents.PLAYER_MOVED);
        this._statesHistory.push(newState);
    }

    RegisterElapsedTime(elapsedTime_ms) {
            if (this._movesHistory.at(-1)?.eventType === GameEvents.PLAYER_SPENT_TIME) {
            this._UpdateCurrentSpentTimeEvent(elapsedTime_ms);
        } else {
            this._PushNewSpentTimeEvent(elapsedTime_ms)
        }
    }

    _UpdateCurrentSpentTimeEvent(elapsedTime_ms) {
        this._movesHistory.at(-1).spentTime += elapsedTime_ms;
        const currentState = this._statesHistory.at(-1);
        const playerIdx = currentState.playerIdx;
        currentState.players.at(playerIdx).remainingTime_ms -= elapsedTime_ms;

        //console.debug("Add spent time (%f)", elapsedTime_ms);
    }

    _PushNewSpentTimeEvent(elapsedTime_ms) {
        let currentState = this._statesHistory.at(-1);
        const playerIdx = currentState.playerIdx;

        this._movesHistory.push( {
            msg: function() {
                const secondsStr = (0.001 * this.spentTime).toFixed(3);
                return `${this.playerName} spent ${secondsStr} seconds`;
            },
            eventType: GameEvents.PLAYER_SPENT_TIME,
            spentTime: elapsedTime_ms,
            playerName: PlayerName(playerIdx)
        });

        const newState = structuredClone(currentState);
        newState.players.at(playerIdx).remainingTime_ms -= elapsedTime_ms;
        this._statesHistory.push(newState);

        //console.debug("Start spent time (%f)", elapsedTime_ms);
    }

    RegisterPlayerTimeout(newState) {
        // ( we must call CurrentPlayerName() before doing _statesHistory.pop() )
        const newEventObject = this._MakePlayerTimeoutEventObject(this.CurrentPlayerName());

        if (this._movesHistory.at(-1)?.eventType === GameEvents.PLAYER_SPENT_TIME) {
            // this sould always be the case, i supose
            this._movesHistory.pop();
            this._statesHistory.pop();
        }
        this._movesHistory.push(newEventObject);
        this._statesHistory.push(newState);
    }

    _MakePlayerTimeoutEventObject(playerName) {
        const msg = `${playerName} lost by timeout`;
        return {
            msg: function() { return msg; },
            eventType: GameEvents.PLAYER_LOST_BY_TIMEOUT
        };
    }

    RegisterPlayerResignation(newState) {
        this._pushMove(`${this.CurrentPlayerName()} resigned`, GameEvents.RESIGNATION);
        this._statesHistory.push(newState);
    }

    RegisterCheckmate(removedPlayers, newState) {
        this._pushMove(this._CheckmateMsg(removedPlayers), GameEvents.CHECKMATE);
        this._statesHistory.push(newState);
    }

    _CheckmateMsg(removedPlayers) {
        let txt = `${this.CurrentPlayerName()} checkmated`;
        for (const p in removedPlayers) {
            const separator = p == 0 ? " " : p < (removedPlayers.length - 1) ? ", " : " and ";
            txt = txt.concat(separator, PlayerName(removedPlayers[p]));
        }
        return txt;
    }

    _pushMove(txt, eventType) {
        this._movesHistory.push({
            msg: function () { return txt; },
            eventType: GameEvents.PLAYER_MOVED
        });
    }

    GetGameStateAt(idx) {
        return this._statesHistory.at(idx);
    }

    GetMove(idx) {
        return this._movesHistory.at(idx);
    }
    GetMoveDescription(idx) {
        return this._movesHistory.at(idx).msg();
    }

    MovesCount() {
        return this._movesHistory.length;
    }

    Rollback(count) {
        const oldSize = this._movesHistory.length
        if (count >= oldSize) {
            this._movesHistory.length = 0;
            this._statesHistory.length = 1;
        } else if (count > 0) {
            this._movesHistory.length = oldSize - count;
            this._statesHistory.length = oldSize - count + 1;
        }
    }
}


class QuaternityClock {
    constructor(players, statusUI, buttonsSet, history) {
        this._players = players;
        this._ui = statusUI;
        for (let i in this._players) {
            this._players[i].onGame = true;
            this._ui.UnhighlightPlayer(i);
        }
        this._ui.HighlightPlayer(0);

        this._activePlayersCount = 4 ;
        this._currentPlayerIdx = 0;
        this._currentPlayer = this._players[0];

        this._previousTimestamp = 0;
        this._thresholdTimestamp = 0.0;
        this._ThresholdTimeCallback = null;
        this._buttonsSet = buttonsSet;
        //this._SaveCurrentStateInHistory();
        this._history = history;
        this._playersRemovalToBeRegistered = new Set();
    }

    _CurrentHistoryState() {
        return new RecoverableGameState(this._players, this._currentPlayerIdx);
    }

    _RequestAnimationFrame()
    {
        const cb = (timestamp) => { this._AnimNewFrameCallback(timestamp); };
        window.requestAnimationFrame(cb);
    }

    _AnimNewFrameCallback(timestamp) {
        if (timestamp >= this._thresholdTimestamp) {
            if (this._previousTimestamp === 0.0) { // means first time this function is called
                this._previousTimestamp = timestamp; // starting timestamp;
            }
            this._ThresholdTimeCallback(timestamp);
        } else if (this._IsCurrentPlayerButtonPressed()) {
            this._OnPlayerButtonPressed(timestamp);
        } else {
            this._RequestAnimationFrame();
        }
    }

    _IsCurrentPlayerButtonPressed() {
        return this._buttonsSet.IsPressed(this._currentPlayerIdx);
    }

    _OnPlayerButtonPressed(timestamp) {
        const elapsedTime = timestamp - this._previousTimestamp;
        this._history.RegisterElapsedTime(elapsedTime);
        this._previousTimestamp = timestamp;

        this._SwitchToNextPlayer(); //this.NextActivePlayerIdx();
        const newState = this._CurrentHistoryState();
        this._history.RegisterPlayerMove(newState);
        this._ui.UpdatePlayersClock(newState);

        this._Run(timestamp);
    }

    Pause() {
        this._thresholdTimestamp = 0;
        this._ThresholdTimeCallback = (timestamp)=>{ this._DoPause(timestamp) };
    }

    _DoPause(timestamp) {
        const elapsedTime = timestamp - this._previousTimestamp;
        this._history.RegisterElapsedTime(elapsedTime);
        this._previousTimestamp = timestamp;

        const remainingTime = this._currentPlayer.SubtractTime(elapsedTime);
        if (remainingTime <= 0.0) {
            this._OnCurrentPlayerTimeOut();
        } else {
            let nextPlayerIdx = this.NextActivePlayerIdx();
            this._ui.AlertPause();
        }
    }

    UnpauseOnCurrentPlayer() {
        this._RegisterPlayersRemovalIfPending();
        this._ui.AlertRunning();
        this._thresholdTimestamp = 0;
        this._ThresholdTimeCallback = (timestamp)=>{ this._Run(timestamp)};
        this._RequestAnimationFrame();
    }

    UnpauseOnNextPlayer() {
        this._RegisterPlayersRemovalIfPending();

        this._SwitchToNextPlayer(); // this.NextActivePlayerIdx()
        const newState = this._CurrentHistoryState();
        this._history.RegisterPlayerMove(newState);
        this._ui.UpdatePlayersClock(newState);

        this.UnpauseOnCurrentPlayer();
    }

    _RegisterPlayersRemovalIfPending() {
        if (this._playersRemovalToBeRegistered.size > 0) {
            const arr = Array.from(this._playersRemovalToBeRegistered);
            this._playersRemovalToBeRegistered.clear();
            this._history.RegisterPlayersRemoval(arr, this._CurrentHistoryState() );
        }
    }

    RegisterCurrentPlayerResignation() {
        this._currentPlayer.onGame = false;
        if (--this._activePlayersCount >= 2) {
            this._ui.DisablePlayer(this._currentPlayerIdx);
            this._currentPlayerIdx = this.NextActivePlayerIdx();
            this._currentPlayer = this._players[this._currentPlayerIdx];
            this._history.RegisterPlayerResignation(this._CurrentHistoryState());
        } else {
            // todo
        }
    }

    RegisterCheckmate(defeatedPlayers) {
        const players = this._SanitizeCheckmateList(defeatedPlayers);
        if (players.length + 1 < this._activePlayersCount) {
            this._activePlayersCount -= players.length;
            for (let p of players) {
                this._players[p].onGame = false;
            }
            this._SwitchToNextPlayer();
            const newState = this._CurrentHistoryState();
            this._history.RegisterCheckmate(players, newState);
            this._ui.UpdatePlayersClock(newState);
        }
    }

    ResignationAndCheckmateShouldBeDisabled() {
        if (this._activePlayersCount > 1) {
            const lastMove = this._history.GetMove(-1);
            return lastMove?.eventType !== GameEvents.PLAYER_SPENT_TIME;
        }
        return true;
    }

    _SanitizeCheckmateList(defeatedPlayers) {
        const result = new Set();
        for (let p of defeatedPlayers) {
            if (p !== this._currentPlayerIdx && this._players.at(p)?.onGame ) {
                result.add(p);
            }
        }
        return Array.from(result).sort();
    }

    PlayersAvailableForUnpausing() {
        if (this._activePlayersCount < 2) { // game is over
            return {};
        }
        if (this._history.GetMove(-1)?.eventType === GameEvents.PLAYER_SPENT_TIME) {
            return {
                current: this._currentPlayerIdx,
                next: this.NextActivePlayerIdx() };
        }
        return { current: this._currentPlayerIdx  };
    }

    _WhenCurrentPlayerDisplayedTimeMustBeIncremented(timestamp) {
        let elapsedTime = timestamp - this._previousTimestamp;
        this._history.RegisterElapsedTime(elapsedTime);
        this._previousTimestamp = timestamp;

        //console.debug("----------------------------------------------------");
        //console.debug("player[%d] time before = %f ms",
        //              this._currentPlayerIdx,
        //              this._currentPlayer.RemainingTime_ms());
        const remainingTime_ms = this._currentPlayer.SubtractTime(elapsedTime);
        //console.debug("player[%d] time after = %f", this._currentPlayerIdx, remainingTime_ms);

        if (remainingTime_ms <= 0) {
            this._OnCurrentPlayerTimeOut();
            return;
        }
        this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime_ms);
        this._Run(timestamp);
    }

    _Run(timestamp) {
        //this._history.RegisterElapsedTime(timestamp - this._previousTimestamp);
        this._previousTimestamp = timestamp;
        this._thresholdTimestamp = timestamp + this._HowLongToUpdateCurrentPlayerTimeAgain();
        this._ThresholdTimeCallback =
            (timestamp)=>{ this._WhenCurrentPlayerDisplayedTimeMustBeIncremented(timestamp) };
        this._RequestAnimationFrame();
    }

    _HowLongToUpdateCurrentPlayerTimeAgain() {
        const remainingTime_ms = this._currentPlayer.RemainingTime_ms();
        if (remainingTime_ms <= 1000.0) {
            return remainingTime_ms;
        }
        const d = remainingTime_ms - 1000.0 * Math.ceil(remainingTime_ms * 0.001 - 1.0);
        return d + 0.1;
    }

    _OnCurrentPlayerTimeOut() {
        playBeep(1.0);
        const playerIdx = this._currentPlayerIdx;
        this._ui.SetPlayerRemainingTimeToZero(playerIdx);
        this._currentPlayer.onGame = false;
        --this._activePlayersCount;
        const gameOver = this._activePlayersCount < 2;
        if (! gameOver) {
            this._SwitchToNextPlayer();
        }
        const newState = this._CurrentHistoryState();
        this._history.RegisterPlayerTimeout(newState);
        this._ui.UpdatePlayersClock(newState);

        const playersForUnpausing = {current: this._currentPlayerIdx};
        this._ui.AlertPlayerLostByTime(playerIdx, gameOver, playersForUnpausing);
    }

    _SwitchToNextPlayer() {
        const playerIdx = this.NextActivePlayerIdx();
        if (playerIdx !== null) {
            if (this._currentPlayer.onGame) {
                this._currentPlayer.OnMoveDone(0);
            }
            this._currentPlayerIdx = playerIdx;
            this._currentPlayer = this._players[this._currentPlayerIdx];
            //this._history.RegisterPlayerMove(newState);
            //this._ui.UpdatePlayersClock(newState);
        }
    }

    NextActivePlayerIdx() {
        return this.PlayerFollowing(this._currentPlayerIdx);
    }

    PlayerFollowing(idx) {
        let count = 0;
        do {
            if (++count === 4) {
                return undefined;
            }
            idx++
            if (idx == this._players.length) {
                idx = 0;
            }
        } while (this._players[idx].onGame === false);
        return idx;
    }

    CurrentPlayerIdx() {
        return this._currentPlayerIdx;
    }

    IsPlayerActive(idx) {
        return this._players[idx].onGame;
    }

    AlivePlayersCount() {
        return this._activePlayersCount;
    }

    Undo(count) {
        this._history.Rollback(count);
        const state = this._history.GetGameStateAt(-1);
        this._currentPlayerIdx = state.playerIdx;
        this._currentPlayer = this._players[this._currentPlayerIdx];
        this._activePlayersCount = 0;
        for (let i in state.players) {
            this._players[i].onGame = state.players[i].onGame;
            this._players[i].SetRemainingTime_ms(state.players[i].remainingTime_ms);
            if (state.players[i].onGame) {
                ++this._activePlayersCount;
            }
        }
        this._ui.UpdatePlayersClock(state); // not necessary though, already done;

        // return players available for unpausing
        const lastMove = this._history.GetMove(-1);
        if (lastMove?.eventType === GameEvents.PLAYER_SPENT_TIME) {
            return {
                current: this._currentPlayerIdx,
                next: this.NextActivePlayerIdx()
            };
        }
        return {current: this._currentPlayerIdx};
    }
};

