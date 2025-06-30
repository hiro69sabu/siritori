/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// このイベントリスナーが、HTMLの読み込み完了を待ってから中のコードを実行します
document.addEventListener('DOMContentLoaded', () => {

  // DOM Elements
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

  // Game Config
  const PLAYER_TOTAL_TIME_SECONDS = 60;
  const AI_TURN_TIME_LIMIT_MS = 15000;
  const MIN_WORD_LENGTH = 2;
  const HIGH_SCORE_STORAGE_KEY = 'shiritoriNeoHighScore';

  // Game State
  let currentWord: string = '';
  let currentLinkingKana: string = '';
  let wordHistory: string[] = [];
  let isPlayerTurn: boolean = false;
  let gameOver: boolean = false;
  let playerTimeRemaining: number = PLAYER_TOTAL_TIME_SECONDS;
  let playerTimerIntervalId: ReturnType<typeof setInterval> | null = null;
  let aiTurnTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let playerTypedCharactersCount: number = 0;

  // Kana Conversion Maps & Functions
  const smallToLargeKanaMap: { [key: string]: string } = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'っ': 'つ', 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ッ': 'ツ', 'ヵ': 'カ', 'ヶ': 'ケ' };
  function convertToLargeKana(char: string): string { return smallToLargeKanaMap[char] || char; }
  function katakanaToHiragana(char: string): string { if (!char) return ''; const code = char.charCodeAt(0); if (code >= 0x30A1 && code <= 0x30F6) { return String.fromCharCode(code - 0x60); } return char; }
  function normalizeCharToLargeHiragana(char: string): string { if (!char) return ''; const largeKana = convertToLargeKana(char); return katakanaToHiragana(largeKana); }

  // Game Initialization
  function initializeGame() {
    startButton.addEventListener('click', startGame);
    playerInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !playerInput.disabled) { handlePlayerSubmit(); } });
    loadHighScore();
  }

  // High Score Logic
  function loadHighScore() { try { const storedHighScore = localStorage.getItem(HIGH_SCORE_STORAGE_KEY); highScoreDisplay.textContent = `最高記録: ${storedHighScore || 0}文字`; } catch (e) { console.error("Failed to load high score:", e); highScoreDisplay.textContent = `最高記録: (読込不可)`; } }
  function saveHighScore(score: number) { try { const storedHighScore = parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) || '0'); if (score > storedHighScore) { localStorage.setItem(HIGH_SCORE_STORAGE_KEY, score.toString()); highScoreDisplay.textContent = `最高記録: ${score}文字 (新記録!)`; highScoreDisplay.classList.add('new-record'); } else { highScoreDisplay.classList.remove('new-record'); } } catch (e) { console.error("Failed to save high score:", e); } }

  // Game Flow
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
    displayMessage('ゲーム開始！最初の言葉(2文字以上)を入力し、Enterキーで送信してください。', false);
    currentWordTextDisplay.textContent = '---';
    previousWordDisplay.textContent = 'なし';
    nextKanaDisplay.textContent = '?';
    setTurn(true);
  }

  function getLastKana(word: string): string { if (!word) return ''; let effectiveLastChar = word.slice(-1); if (effectiveLastChar === 'ー') { if (word.length >= 2) { effectiveLastChar = word.slice(-2, -1); } else { return ''; } } return normalizeCharToLargeHiragana(effectiveLastChar); }

  function validatePlayerWord(playerWord: string): { isValid: boolean, message: string, word: string } {
    const trimmedWord = playerWord.trim();
    if (!trimmedWord) return { isValid: false, message: '言葉を入力してください。', word: trimmedWord };
    if (!/^[ぁ-んァ-ンヴー]+$/.test(trimmedWord)) return { isValid: false, message: 'ひらがなまたはカタカナで入力してください。', word: trimmedWord };
    if (trimmedWord.length < MIN_WORD_LENGTH) return { isValid: false, message: `${MIN_WORD_LENGTH}文字以上の言葉を入力してください。`, word: trimmedWord };
    if (trimmedWord.slice(-1) === 'ん' || trimmedWord.slice(-1) === 'ン') return { isValid: false, message: '「ん」で終わる言葉は使えません！あなたの負けです。', word: trimmedWord };
    // ... 他のバリデーションルールは省略 ...
    if (wordHistory.map(w => w.split(': ')[1]).includes(trimmedWord)) return { isValid: false, message: 'その言葉は既に使用されています。', word: trimmedWord };
    if (currentLinkingKana) { const playerFirstCharNormalized = normalizeCharToLargeHiragana(trimmedWord.charAt(0)); if (playerFirstCharNormalized !== currentLinkingKana) { return { isValid: false, message: `「${currentLinkingKana}」で始まる言葉を入力してください。`, word: trimmedWord }; } }
    return { isValid: true, message: '良い言葉です！', word: trimmedWord };
  }

  async function handlePlayerSubmit() {
    if (!isPlayerTurn || gameOver) return;
    const validation = validatePlayerWord(playerInput.value);
    if (!validation.isValid) { displayMessage(validation.message, true); if (validation.message.includes("あなたの負けです")) { endGame(validation.message); } return; }
    if (wordHistory.length > 0) stopPlayerTimer();
    const validPlayerWord = validation.word;
    displayMessage('AIの応答を待っています...', false);
    addWordToHistory(validPlayerWord, "あなた");
    playerTypedCharactersCount += validPlayerWord.length;
    currentWord = validPlayerWord;
    currentLinkingKana = getLastKana(validPlayerWord);
    if (!currentLinkingKana) { endGame(`「${validPlayerWord}」から次の文字を特定できませんでした。あなたの負けです。`); return; }
    updateUIForNewWord();
    playerInput.value = '';
    setTurn(false);
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = setTimeout(() => { if (!isPlayerTurn && !gameOver) { endGame("AIが15秒以内に応答しませんでした。あなたの勝ちです！"); } }, AI_TURN_TIME_LIMIT_MS);
    
    // バックエンドに渡すプロンプトを構築
    const prompt = `あなたはしりとりゲームのAIです。厳格なルールに従ってください。ルール: 1. ${MIN_WORD_LENGTH}文字以上。 2. ひらがな・カタカナのみ。 3.「ん」で終わらない。 4. 既出単語禁止 (履歴: ${wordHistory.map(w => w.split(': ')[1]).join(', ')})。 5. 直前の単語は「${validPlayerWord}」でした。次の単語は「${currentLinkingKana}」で始まる一般的な名詞を一つだけ答えてください。`;
    const aiResponse = await getAIWord(prompt);

    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = null;
    if (gameOver) return;
    if (aiResponse) {
      processAIsWord(aiResponse);
    } else {
      if (!gameOver) endGame("AIが言葉を見つけられませんでした。あなたの勝ちです！");
    }
  }

  // ★★★ API呼び出し関数を修正 ★★★
  async function getAIWord(prompt: string): Promise<string | null> {
    try {
      //【重要修正】APIのパスを、Vercelが正しく認識できる '/api/ai.js' に変更
      const response = await fetch('/api/ai.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: prompt }),
      });

      // サーバーからのレスポンスをJSONとして解析
      const data = await response.json();

      // サーバーがエラーを返した場合（200番台以外のステータスコード）
      if (!response.ok) {
        console.error("サーバーがエラーを返しました:", data);
        //【改善】サーバーからの詳細なエラーメッセージを表示
        const errorMessage = data.error?.message || '不明なサーバーエラーが発生しました。';
        displayMessage(`サーバーエラー: ${errorMessage} (コード: ${response.status})`, true);
        return null;
      }
      
      return data.text;

    } catch (error) {
      // ネットワークエラーや、レスポンスがJSONでない場合など
      console.error("バックエンドAPIとの通信エラー:", error);
      displayMessage("サーバーとの通信に失敗しました。ネットワーク接続か、サーバーのログを確認してください。", true);
      return null;
    }
  }

  function processAIsWord(aiWord: string) {
    // AIの単語検証ロジック (省略)
    // ...
    addWordToHistory(aiWord, "AI");
    currentWord = aiWord;
    currentLinkingKana = getLastKana(aiWord);
    if (!currentLinkingKana) { endGame(`AIが無効な単語「${aiWord}」を出しました。あなたの勝ちです！`); return; }
    updateUIForNewWord();
    setTurn(true);
    startPlayerTimer();
    displayMessage('あなたの番です。Enterキーで送信してください。', false);
  }

  // UI and Timer Functions
  function setTurn(isPlayer: boolean) { isPlayerTurn = isPlayer; playerInput.disabled = !isPlayer || gameOver; if (isPlayer && !gameOver) playerInput.focus(); }
  function addWordToHistory(word: string, player: "あなた" | "AI") { const entry = `${player}: ${word}`; wordHistory.push(entry); updateWordHistoryUI(); }
  function updateWordHistoryUI() { wordHistoryUl.innerHTML = ''; wordHistory.forEach(entry => { const li = document.createElement('li'); li.textContent = entry; wordHistoryUl.appendChild(li); }); wordHistoryUl.scrollTop = wordHistoryUl.scrollHeight; }
  function updateUIForNewWord() { currentWordTextDisplay.textContent = currentWord; previousWordDisplay.textContent = wordHistory.length > 1 ? wordHistory[wordHistory.length - 2].split(': ')[1] : (wordHistory.length === 1 ? wordHistory[0].split(': ')[1] : 'なし'); nextKanaDisplay.textContent = currentLinkingKana; }
  function displayMessage(message: string, isError: boolean) { gameMessage.textContent = message; gameMessage.className = isError ? 'error' : 'success'; }
  function clearTimers() { if (playerTimerIntervalId) clearInterval(playerTimerIntervalId); if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId); playerTimerIntervalId = null; aiTurnTimeoutId = null; }
  function startPlayerTimer() { if (gameOver) return; clearTimers(); playerTimerIntervalId = setInterval(() => { playerTimeRemaining--; playerTimeRemainingDisplay.textContent = playerTimeRemaining.toString(); if (playerTimeRemaining <= 0) { endGame("時間切れです！あなたの負けです。"); } }, 1000); }
  function stopPlayerTimer() { if (playerTimerIntervalId) { clearInterval(playerTimerIntervalId); playerTimerIntervalId = null; } }
  function endGame(message: string) { if (gameOver) return; gameOver = true; clearTimers(); displayMessage(message, false); setTurn(false); startButton.disabled = false; startButton.textContent = 'もう一度遊ぶ'; scoreDisplayArea.classList.remove('hidden'); playerScoreDisplay.textContent = `あなたがタイプした総文字数: ${playerTypedCharactersCount}`; saveHighScore(playerTypedCharactersCount); }

  // Initialize
  initializeGame();
});