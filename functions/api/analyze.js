// 🌸 프롬프트 보완 (rubySentences, wordList 필수 생성 강제)
    const payload = {
      systemInstruction: {
        parts: [{
          text: `Task: Analyze Japanese text for language learners. Output JSON ONLY.
Target Language for Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. "rubySentences" MUST NOT be empty. Convert every Japanese sentence using <ruby>한자<rt>요미가나</rt></ruby> tags.
2. "wordList", "kanjiList", and "grammarList" MUST contain analyzed components from the input text.
3. DO NOT output multilingual maps. Provide all "meaning" and "explanation" fields ONLY in ${langGuide}.
4. "partOfSpeech" MUST be strictly one from: ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].

JSON Schema Example:
{
  "isJapanese": true,
  "translatedText": "Full text translation in ${langGuide}",
  "rubySentences": [
    "山中<ruby>市長<rt>しちょう</rt></ruby>は<ruby>記者会見<rt>きしゃかいけん</rt></ruby>で..."
  ],
  "wordList": [
    {
      "word": "市長",
      "reading": "しちょう",
      "partOfSpeech": "noun",
      "meaning": "Meaning string in ${langGuide}",
      "jlpt": "N3"
    }
  ],
  "kanjiList": [
    {
      "kanji": "市",
      "readings": "シ",
      "meaning": "Meaning string in ${langGuide}"
    }
  ],
  "grammarList": [
    {
      "grammar": "〜において",
      "explanation": "Explanation string in ${langGuide}"
    }
  ]
}`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2500,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };