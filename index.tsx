/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * 
 * しりとりタイピングアプリ メインロジック
 * Ver.3.0 (AI審判ロジック実装版)
 * 
 * このバージョンでは、AIの役割を「単語リストの生成」に限定し、
 * しりとりの全ルール判定をこのフロントエンド側で実行する「AI審判ロジック」を実装しています。
 */

// promptBuilderは新しいシンプルなバージョンを使用します
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
  const PLAYER_TOTAL_TIME_SECONDS = 60;
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
  // ★★★★★ 新しいルール判定ロジックの中核 ★★★★★
  // =================================================================

  /**
   * ルール仕様書【2. 継承ルール】に基づき、単語の最後の文字から次の開始文字を特定します。
   * @param word - 判定対象の単語
   * @returns 次の開始文字（ひらがな化済み）、または特定不能の場合は空文字
   */
  function getNextKana(word: string): string {
    if (!word) return '';

    // ルール 2-A: 長音記号（ー）の処理
    if (word.endsWith('ー')) {
      if (word.length < 2) return '';
      // 再帰的に呼び出すことで、「ッシャー」のようなケースにも対応
      return getNextKana(word.slice(0, -1));
    }
    
    // ルール 2-B: 促音（っ）の処理
    if (word.endsWith('っ') || word.endsWith('ッ')) {
      if (word.length < 2) return '';
      return getNextKana(word.slice(0, -1));
    }

    const lastChar = word.slice(-1);

    // ルール 2-C: 拗音（ゃ, ゅ, ょ）の処理
    const smallToLargeKanaMap: { [key: string]: string } = {
      'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
      'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ'
    };
    if (smallToLargeKanaMap[lastChar]) {
      return katakanaToHiragana(smallToLargeKanaMap[lastChar]);
    }

    // ルール 2-D: 通常ルール
    return katakanaToHiragana(lastChar);
  }
  
  /**
   * ルール仕様書【3-C】に基づき、文字の濁点・半濁点を取り除き、正規化（清音化）します。
   * @param kana - 判定対象のカナ文字
   * @returns 清音化されたカナ文字
   */
  function normalizeKana(kana: string): string {
    const dakutenMap: { [key: string]: string } = {
      'が': 'か', 'ぎ': 'き', 'ぐ': 'く', 'げ': 'け', 'ご': 'こ',
      'ざ': 'さ', 'じ': 'し', 'ず': 'す', 'ぜ': 'せ', 'ぞ': 'そ',
      'だ': 'た', 'ぢ': 'ち', 'づ': 'つ', 'で': 'て', 'ど': 'と',
      'ば': 'は', 'び': 'ひ', 'ぶ': 'ふ', 'べ': 'へ', 'ぼ': 'ほ',
      'ヴ': 'う'
    };
    const handakutenMap: { [key: string]: string } = {
      'ぱ': 'は', 'ぴ': 'ひ', 'ぷ': 'ふ', 'ぺ': 'へ', 'ぽ': 'ほ'
    };
    const baseKana = katakanaToHiragana(kana);
    return dakutenMap[baseKana] || handakutenMap[baseKana] || baseKana;
  }
  
  /**
   * AIから返された単語リストをルール仕様書に基づき検証し、最適な回答を1つ選択します。
   * これが「AI審判」機能の心臓部です。
   * @param rawResponse - AIからのカンマ区切りの単語リスト文字列
   * @param requiredKana - AIが従うべき開始文字
   * @param usedWords - これまで使用された単語のリスト
   * @returns 有効な単語が見つかればその単語を、見つからなければnullを返す
   */
  function findBestAiResponse(rawResponse: string, requiredKana: string, usedWords: string[]): string | null {
    if (!rawResponse) return null;

    const potentialWords = rawResponse.split(',')
      .map(w => w.trim()) // 前後の空白を除去
      .filter(w => w);   // 空の要素を除去

    // 応答をシャッフルし、毎回同じ単語を選ばないようにする
    const shuffledWords = potentialWords.sort(() => Math.random() - 0.5);

    const normalizedRequiredKana = normalizeKana(requiredKana);
    const historyWords = usedWords.map(w => w.split(': ')[1]);

    for (const word of shuffledWords) {
      // ルール 1: 「ん」で終わる単語は失格
      if (word.endsWith('ん') || word.endsWith('ン')) {
        continue; // 次の候補へ
      }
      
      // 文字数ルールのチェック
      if (word.length < MIN_WORD_LENGTH) {
        continue;
      }
      
      // ルール 3-B: 重複禁止
      if (historyWords.includes(word)) {
        continue;
      }
      
      // ルール 3-C: 継承ルールの柔軟な判定
      const firstChar = katakanaToHiragana(word.charAt(0));
      const normalizedFirstChar = normalizeKana(firstChar);

      if (normalizedFirstChar === normalizedRequiredKana) {
        // 全てのチェックをクリアした最初の単語を返す
        return word;
      }
    }

    // どの単語もルールに適合しなかった
    return null;
  }

  // =================================================================
  // 既存ヘルパー関数 (一部修正)
  // =================================================================
  function katakanaToHiragana(str: string): string {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
  }

  function validatePlayerWord(playerWord: string): { isValid: boolean, message: string, word: string } {
    const trimmedWord = playerWord.trim();
    if (!trimmedWord) return { isValid: false, message: '言葉を入力してください。', word: trimmedWord };
    if (!/^[ぁ-んァ-ンヴー]+$/.test(trimmedWord)) return { isValid: false, message: 'ひらがなまたはカタカナで入力してください。', word: trimmedWord };
    if (trimmedWord.length < MIN_WORD_LENGTH) return { isValid: false, message: `${MIN_WORD_LENGTH}文字以上の言葉を入力してください。`, word: trimmedWord };
    if (trimmedWord.length >= 3 && new Set(katakanaToHiragana(trimmedWord).split('')).size === 1) {
        return { isValid: false, message: '同じ文字が連続する単語は使用できません。', word: trimmedWord };
    }
    if (trimmedWord.slice(-1) === 'ん' || trimmedWord.slice(-1) === 'ン') return { isValid: false, message: '「ん」で終わる言葉は使えません！ゲーム終了です。', word: trimmedWord };
    if (wordHistory.map(w => w.split(': ')[1]).includes(trimmedWord)) return { isValid: false, message: 'その言葉は既に使用されています。', word: trimmedWord };

    // ここでの開始文字チェックは、濁点・半濁点を区別しないように修正
    if (currentLinkingKana) { 
        const playerFirstChar = katakanaToHiragana(trimmedWord.charAt(0));
        if (normalizeKana(playerFirstChar) !== normalizeKana(currentLinkingKana)) {
            return { isValid: false, message: `「${currentLinkingKana}」で始まる言葉を入力してください。`, word: trimmedWord };
        }
    }
    return { isValid: true, message: '良い言葉です！', word: trimmedWord };
  }
  
  // =================================================================
  // Game Flow (メインロジックの改修)
  // =================================================================
  
  async function handlePlayerSubmit() {
    if (!isPlayerTurn || gameOver) return;
    const validation = validatePlayerWord(playerInput.value);
    if (!validation.isValid) { 
      displayMessage(validation.message, true); 
      if (validation.message.includes("ゲーム終了")) { 
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
    currentLinkingKana = getNextKana(validPlayerWord); // 新しい関数を使用
    
    if (!currentLinkingKana) { 
      endGame(`「${validPlayerWord}」から次の文字を特定できませんでした。あなたの負けです。`); 
      return; 
    }
    
    updateUIForNewWord();
    playerInput.value = '';
    setTurn(false);
    
    // AIの思考時間タイマーを設定
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = setTimeout(() => { 
      if (!isPlayerTurn && !gameOver) { 
        endGame("AIが15秒以内に応答しませんでした。あなたの勝ちです！"); 
      } 
    }, AI_TURN_TIME_LIMIT_MS);
    
    // ★★★★★ ここがAIとのやり取りの大きな変更点 ★★★★★
    // 1. シンプルなプロンプトを作成
    const prompt = buildPrompt(currentLinkingKana);
    
    // 2. AIから「単語リスト」を取得
    const aiResponseText = await getAIWord(prompt);
    
    // 3. AIの応答を待ってからタイマーを解除
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = null;

    if (gameOver) return;
    
    if (aiResponseText) {
      // 4. 「審判」が単語リストを検証し、最適な単語を一つ選ぶ
      const validAiWord = findBestAiResponse(aiResponseText, currentLinkingKana, wordHistory);
      
      if (validAiWord) {
        // 5. 有効な単語が見つかった場合、ゲームを続行
        processValidAiWord(validAiWord);
      } else {
        // 6. 有効な単語が一つも見つからなかった場合、AIの負け
        endGame(`AIは「${currentLinkingKana}」から始まる有効な言葉を見つけられませんでした。あなたの勝ちです！`);
      }
    } else {
      // API通信自体が失敗した場合
      if (!gameOver) endGame("AIとの通信に失敗しました。あなたの勝ちです！");
    }
  }

  async function getAIWord(prompt: string): Promise<string | null> {
    try {
      const response = await fetch('/api/ai.js', { // /api/ai.jsを呼び出す
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
  
  // `processAIsWord`は、検証済みの単語を処理するだけのシンプルな関数に
  function processValidAiWord(validAiWord: string) {
    addWordToHistory(validAiWord, "AI");
    currentWord = validAiWord;
    currentLinkingKana = getNextKana(validAiWord); // 新しい関数を使用
    
    if (!currentLinkingKana) { 
      endGame(`AIが無効な単語「${validAiWord}」を出しました。あなたの勝ちです！`); 
      return; 
    }
    
    updateUIForNewWord();
    setTurn(true);
    startPlayerTimer();
    displayMessage('あなたの番です。Enterキーで送信してください。', false);
  }

  // =================================================================
  // UI, Timers, and Game State Functions (ほぼ変更なし)
  // =================================================================
  function initializeGame() {
    startButton.addEventListener('click', startGame);
    playerInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !playerInput.disabled) { handlePlayerSubmit(); } });
    loadHighScore();
  }

  function loadHighScore() { try { const storedHighScore = localStorage.getItem(HIGH_SCORE_STORAGE_KEY); highScoreDisplay.textContent = `最高記録: ${storedHighScore || 0}文字`; } catch (e) { console.error("Failed to load high score:", e); highScoreDisplay.textContent = `最高記録: (読込不可)`; } }
  function saveHighScore(score: number) { try { const storedHighScore = parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) || '0'); if (score > storedHighScore) { localStorage.setItem(HIGH_SCORE_STORAGE_KEY, score.toString()); highScoreDisplay.textContent = `最高記録: ${score}文字 (新記録!)`; highScoreDisplay.classList.add('new-record'); } else { highScoreDisplay.classList.remove('new-record'); } } catch (e) { console.error("Failed to save high score:", e); } }

  async function startGame() {
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

  function setTurn(isPlayer: boolean) { isPlayerTurn = isPlayer; playerInput.disabled = !isPlayer || gameOver; if (isPlayer && !gameOver) playerInput.focus(); }
  function addWordToHistory(word: string, player: "あなた" | "AI") { const entry = `${player}: ${word}`; wordHistory.push(entry); updateWordHistoryUI(); }
  function updateWordHistoryUI() { wordHistoryUl.innerHTML = ''; wordHistory.forEach(entry => { const li = document.createElement('li'); li.textContent = entry; wordHistoryUl.appendChild(li); }); wordHistoryUl.scrollTop = wordHistoryUl.scrollHeight; }
  function updateUIForNewWord() { currentWordTextDisplay.textContent = currentWord; previousWordDisplay.textContent = wordHistory.length > 1 ? wordHistory[wordHistory.length - 2].split(': ')[1] : (wordHistory.length === 1 ? wordHistory[0].split(': ')[1] : 'なし'); nextKanaDisplay.textContent = currentLinkingKana; }
  function displayMessage(message: string, isError: boolean) { gameMessage.textContent = message; gameMessage.className = isError ? 'error' : 'success'; }
  function clearTimers() { if (playerTimerIntervalId) clearInterval(playerTimerIntervalId); if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId); playerTimerIntervalId = null; aiTurnTimeoutId = null; }
  
  function startPlayerTimer() { 
    if (gameOver) return; 
    clearTimers(); 
    playerTimerIntervalId = setInterval(() => { 
      playerTimeRemaining--; 
      playerTimeRemainingDisplay.textContent = playerTimeRemaining.toString(); 
      if (playerTimeRemaining <= 0) { 
        endGame("時間切れです！あなたの負けです。");
      } 
    }, 1000); 
  }
  
  function stopPlayerTimer() { if (playerTimerIntervalId) { clearInterval(playerTimerIntervalId); playerTimerIntervalId = null; } }
  
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