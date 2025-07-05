/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * 
 * しりとりタイピングアプリ メインロジック
 * Ver.3.4 (構文エラー修正版)
 * 
 * これまでの全ての修正に加え、二重定義エラーを修正した最終版です。
 */

import { buildPrompt } from './api/promptBuilder';

document.addEventListener('DOMContentLoaded', () => {

  // =================================================================
  // DOM Elements
  // =================================================================
  const startButton = document.getElementById('startButton') as HTMLButtonElement;
  const gameArea = document.getElementById('game-area') as HTMLDivElement;
  const nextKanaDisplay = document.getElementById('next-kana') as HTMLSpanElement;
  const currentWordTextDisplay = document.getElementById('current-word-text') as HTMLHeadingElement;
  const playerInput = document.getElementById('player-input') as HTMLInputElement;
  const gameMessage = document.getElementById('game-message') as HTMLParagraphElement;
  const wordHistoryUl = document.getElementById('word-history') as HTMLUListElement;
  const playerTimeRemainingDisplay = document.getElementById('player-time-remaining') as HTMLSpanElement;
  const previousWordDisplay = document.getElementById('previous-word-display') as HTMLSpanElement;
  const scoreDisplayArea = document.getElementById('score-display-area') as HTMLDivElement;
  const playerScoreDisplay = document.getElementById('player-score-display') as HTMLParagraphElement;
  const highScoreDisplay = document.getElementById('high-score-display') as HTMLParagraphElement;

  // =================================================================
  // Game Configuration
  // =================================================================
  const PLAYER_TOTAL_TIME_SECONDS = 100;
  const AI_TURN_TIME_LIMIT_MS = 15000;
  const MIN_WORD_LENGTH = 2;
  const HIGH_SCORE_STORAGE_KEY = 'shiritoriNeoHighScore';

  // =================================================================
  // Game State
  // =================================================================
  let currentWord: string = '';
  let currentLinkingKana: string = '';
  let wordHistory: string[] = [];
  let isPlayerTurn: boolean = false;
  let gameOver: boolean = false;
  let playerTimeRemaining: number = PLAYER_TOTAL_TIME_SECONDS;
  let playerTimerIntervalId: ReturnType<typeof setInterval> | null = null;
  let aiTurnTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let playerTypedCharactersCount: number = 0;
  
  // =================================================================
  // ルール判定ロジックの中核
  // =================================================================

  function getNextKana(word: string): string {
    if (!word) return '';
    if (word.endsWith('ー')) {
      if (word.length < 2) return '';
      return getNextKana(word.slice(0, -1));
    }
    if (word.endsWith('っ') || word.endsWith('ッ')) {
      if (word.length < 2) return '';
      return getNextKana(word.slice(0, -1));
    }
    const lastChar = word.slice(-1);
    const smallToLargeKanaMap: { [key: string]: string } = {
      'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
      'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ'
    };
    if (smallToLargeKanaMap[lastChar]) {
      return katakanaToHiragana(smallToLargeKanaMap[lastChar]);
    }
    return katakanaToHiragana(lastChar);
  }
  
  function normalizeKana(kana: string): string {
    const dakutenMap: { [key: string]: string } = {
      'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ', 'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ',
      'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と', 'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ', 'ヴ': 'う'
    };
    const handakutenMap: { [key: string]: string } = { 'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ' };
    const baseKana = katakanaToHiragana(kana);
    return dakutenMap[baseKana] || handakutenMap[baseKana] || baseKana;
  }
  
  function isValidKanaType(word: string): boolean {
    const isAllHiragana = /^[ぁ-んー]+$/.test(word);
    const isAllKatakana = /^[ァ-ンヴー]+$/.test(word);
    return isAllHiragana || isAllKatakana;
  }

  function findBestAiResponse(rawResponse: string, requiredKana: string, usedWords: string[]): string | null {
    if (!rawResponse) return null;
    const potentialWords = rawResponse.split(',').map(w => w.trim()).filter(w => w);
    const shuffledWords = potentialWords.sort(() => Math.random() - 0.5);
    const normalizedRequiredKana = normalizeKana(requiredKana);
    const historyWords = usedWords.map(w => w.split(': ')[1]);

    for (const word of shuffledWords) {
      if (!isValidKanaType(word)) continue;
      if (word.endsWith('ん') || word.endsWith('ン')) continue;
      if (word.length < MIN_WORD_LENGTH) continue;
      if (historyWords.includes(word)) continue;
      
      const firstChar = katakanaToHiragana(word.charAt(0));
      const normalizedFirstChar = normalizeKana(firstChar);
      if (normalizedFirstChar === normalizedRequiredKana) {
        return word;
      }
    }
    return null;
  }

  function katakanaToHiragana(str: string): string {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0x60));
  }

  function validatePlayerWord(playerWord: string): { isValid: boolean, message: string, word: string } {
    const trimmedWord = playerWord.trim();
    if (!trimmedWord) return { isValid: false, message: '言葉を入力してください。', word: trimmedWord };
    if (!isValidKanaType(trimmedWord)) {
        return { isValid: false, message: 'ひらがな、またはカタカナのみで入力してください（混在はできません）。', word: trimmedWord };
    }
    if (trimmedWord.length < MIN_WORD_LENGTH) return { isValid: false, message: `${MIN_WORD_LENGTH}文字以上の言葉を入力してください。`, word: trimmedWord };
    if (trimmedWord.length >= 3 && new Set(katakanaToHiragana(trimmedWord).split('')).size === 1) {
        return { isValid: false, message: '同じ文字が連続する単語は使用できません。', word: trimmedWord };
    }
    if (trimmedWord.slice(-1) === 'ん' || trimmedWord.slice(-1) === 'ン') return { isValid: false, message: '「ん」で終わる言葉は使えません！', word: trimmedWord };
    if (wordHistory.map(w => w.split(': ')[1]).includes(trimmedWord)) return { isValid:false, message: 'その言葉は既に使用されています。', word: trimmedWord };

    if (currentLinkingKana) { 
        const playerFirstChar = katakanaToHiragana(trimmedWord.charAt(0));
        if (normalizeKana(playerFirstChar) !== normalizeKana(currentLinkingKana)) {
            return { isValid: false, message: `「${currentLinkingKana}」で始まる言葉を入力してください。`, word: trimmedWord };
        }
    }
    return { isValid: true, message: '良い言葉です！', word: trimmedWord };
  }
  
  async function handlePlayerSubmit() {
    if (!isPlayerTurn || gameOver) return;
    const validation = validatePlayerWord(playerInput.value);
    if (!validation.isValid) {
      displayMessage(validation.message, true);
      if (validation.message.includes("ん")) {
        endGame(validation.message);
      }
      return;
    }
    if (wordHistory.length > 0) stopPlayerTimer();
    const validPlayerWord = validation.word;
    displayMessage('AIの応答を待っています...', false);
    addWordToHistory(validPlayerWord, "あなた");
    playerTypedCharactersCount += validPlayerWord.length;
    currentWord = validPlayerWord;
    currentLinkingKana = getNextKana(validPlayerWord);
    if (!currentLinkingKana) {
      endGame(`「${validPlayerWord}」から次の文字を特定できませんでした。`);
      return;
    }
    updateUIForNewWord();
    playerInput.value = '';
    setTurn(false);
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = setTimeout(() => {
      if (!isPlayerTurn && !gameOver) {
        endGame("AIが15秒以内に応答しませんでした。あなたの勝ちです！");
      }
    }, AI_TURN_TIME_LIMIT_MS);
    const prompt = buildPrompt(currentLinkingKana);
    const aiResponseText = await getAIWord(prompt);
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = null;
    if (gameOver) return;
    if (aiResponseText) {
      const validAiWord = findBestAiResponse(aiResponseText, currentLinkingKana, wordHistory);
      if (validAiWord) {
        processValidAiWord(validAiWord);
      } else {
        endGame(`AIは「${currentLinkingKana}」から始まる有効な言葉を見つけられませんでした。あなたの勝ちです！`);
      }
    } else {
      if (!gameOver) endGame("AIとの通信に失敗しました。あなたの勝ちです！");
    }
  }

  async function getAIWord(prompt: string): Promise<string | null> {
    try {
      const response = await fetch('/api/ai.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt }),
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.error?.message || '不明なサーバーエラー';
        displayMessage(`サーバーエラー: ${errorMessage}`, true);
        return null;
      }
      return data.text;
    } catch (error) {
      console.error("API通信エラー:", error);
      displayMessage("サーバーとの通信に失敗しました。ネットワークを確認してください。", true);
      return null;
    }
  }
  
  function processValidAiWord(validAiWord: string) {
    addWordToHistory(validAiWord, "AI");
    currentWord = validAiWord;
    currentLinkingKana = getNextKana(validAiWord);
    if (!currentLinkingKana) {
      endGame(`AIが無効な単語「${validAiWord}」を出しました。あなたの勝ちです！`);
      return;
    }
    updateUIForNewWord();
    setTurn(true);
    startPlayerTimer();
    displayMessage('あなたの番です。Enterキーで送信してください。', false);
  }

  function initializeGame() {
    startButton.addEventListener('click', startGame);
    playerInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && !playerInput.disabled) {
        handlePlayerSubmit();
      }
    });
    loadHighScore();
  }

  function loadHighScore() {
    try {
      const storedHighScore = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
      highScoreDisplay.textContent = `最高記録: ${storedHighScore || 0}文字`;
    } catch (e) {
      console.error("Failed to load high score:", e);
      highScoreDisplay.textContent = `最高記録: (読込不可)`;
    }
  }

  function saveHighScore(score: number) {
    try {
      const storedHighScore = parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) || '0');
      if (score > storedHighScore) {
        localStorage.setItem(HIGH_SCORE_STORAGE_KEY, score.toString());
        highScoreDisplay.textContent = `最高記録: ${score}文字 (新記録!)`;
        highScoreDisplay.classList.add('new-record');
      } else {
        highScoreDisplay.classList.remove('new-record');
      }
    } catch (e) {
      console.error("Failed to save high score:", e);
    }
  }

  function startGame() {
    gameOver = false;
    wordHistory = [];
    currentWord = '';
    currentLinkingKana = '';
    isPlayerTurn = false;
    playerTypedCharactersCount = 0;
    clearTimers();
    playerTimeRemaining = PLAYER_TOTAL_TIME_SECONDS;
    playerTimeRemainingDisplay.textContent = playerTimeRemaining.toString();
    gameArea.classList.remove('hidden');
    scoreDisplayArea.classList.add('hidden');
    startButton.textContent = 'リセットして再挑戦';
    startButton.disabled = false;
    updateWordHistoryUI();
    displayMessage('ゲーム開始！最初の言葉(2文字以上)を入力してください。', false);
    currentWordTextDisplay.textContent = '---';
    previousWordDisplay.textContent = 'なし';
    nextKanaDisplay.textContent = '?';
    setTurn(true);
  }

  function setTurn(isPlayer: boolean) {
    isPlayerTurn = isPlayer;
    playerInput.disabled = !isPlayer || gameOver;
    if (isPlayer && !gameOver) playerInput.focus();
  }

  function addWordToHistory(word: string, player: "あなた" | "AI") {
    const entry = `${player}: ${word}`;
    wordHistory.push(entry);
    updateWordHistoryUI();
  }

  function updateWordHistoryUI() {
    wordHistoryUl.innerHTML = '';
    wordHistory.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = entry;
      wordHistoryUl.appendChild(li);
    });
    wordHistoryUl.scrollTop = wordHistoryUl.scrollHeight;
  }

  function updateUIForNewWord() {
    currentWordTextDisplay.textContent = currentWord;
    previousWordDisplay.textContent = wordHistory.length > 1 ? wordHistory[wordHistory.length - 2].split(': ')[1] : (wordHistory.length === 1 ? wordHistory[0].split(': ')[1] : 'なし');
    nextKanaDisplay.textContent = currentLinkingKana;
  }

  function displayMessage(message: string, isError: boolean) {
    gameMessage.textContent = message;
    gameMessage.className = isError ? 'error' : 'success';
  }

  function clearTimers() {
    if (playerTimerIntervalId) clearInterval(playerTimerIntervalId);
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    playerTimerIntervalId = null;
    aiTurnTimeoutId = null;
  }
  
  function startPlayerTimer() {
    if (gameOver) return;
    clearTimers();
    playerTimerIntervalId = setInterval(() => {
      playerTimeRemaining--;
      playerTimeRemainingDisplay.textContent = playerTimeRemaining.toString();
      if (playerTimeRemaining <= 0) {
        endGame("時間切れです。お疲れ様でした。");
      }
    }, 1000);
  }
  
  function stopPlayerTimer() {
    if (playerTimerIntervalId) {
      clearInterval(playerTimerIntervalId);
      playerTimerIntervalId = null;
    }
  }
  
  function endGame(message: string) {
    if (gameOver) return;
    gameOver = true;
    clearTimers();
    displayMessage(message, false);
    setTurn(false);
    startButton.disabled = false;
    startButton.textContent = 'もう一度遊ぶ';
    scoreDisplayArea.classList.remove('hidden');
    playerScoreDisplay.textContent = `あなたがタイプした総文字数: ${playerTypedCharactersCount}`;
    saveHighScore(playerTypedCharactersCount);
  }

  // Initialize
  initializeGame();
});