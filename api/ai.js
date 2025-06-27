import { GoogleGenAI } from "@google/genai";

// この関数が、Vercelのサーバーレス関数として動作します
export default async function handler(req, res) {
  // CORSヘッダーの設定（どのウェブサイトからでもAPIを呼び出せるようにする）
  // 本番環境では、特定のドメインに限定するのがより安全です
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSメソッドのリクエストは、CORSのプリフライトチェック用なので、ここで処理を終了
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッド以外のリクエストは受け付けない
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Vercelの環境変数からAPIキーを安全に取得
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // APIキーが設定されていない場合は、サーバー側でエラーを返す
      return res.status(500).json({ error: 'APIキーがサーバーに設定されていません。' });
    }

    // フロントエンドから送られてきたデータを取得
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'プロンプトがありません。' });
    }
    
    // Gemini APIのクライアントを初期化
    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" });

    // Gemini APIにプロンプトを送信し、結果を取得
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    // 成功した結果をフロントエンドに返す
    res.status(200).json({ text: aiText });

  } catch (error) {
    // 何かエラーが発生した場合
    console.error("APIルートでエラーが発生しました:", error);
    res.status(500).json({ error: 'AIとの通信中にサーバーでエラーが発生しました。' });
  }
}
