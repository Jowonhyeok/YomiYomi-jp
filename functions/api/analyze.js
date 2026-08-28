const payload = {
      systemInstruction: {
        parts: [{
          text: `Task: Analyze Japanese text for learners. FAST RESPONSE REQUIRED. Output JSON ONLY.
Target Language for ALL Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. Output MUST be valid JSON only without markdown.
2. "meaning" and "explanation" MUST BE A SINGLE STRING in "${langGuide}" ONLY. Never output JSON objects/maps for meanings.
3. "rubySentences": Convert Japanese kanji using <ruby>漢字<rt>かんじ</rt></ruby> tags.
4. "wordList": Extract MAX 10 key words.
5. "kanjiList": Extract MAX 8 key kanji.
6. "grammarList": Extract MAX 5 key grammar structures.
7. "partOfSpeech": MUST be strictly one from: ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].

JSON Schema:
{
  "isJapanese": true,
  "translatedText": "Full text translation in ${langGuide}",
  "rubySentences": ["山中<ruby>市長<rt>しちょう</rt></ruby>は..."],
  "wordList": [{"word":"市長","reading":"しちょう","partOfSpeech":"noun","meaning":"Single String Meaning in ${langGuide}","jlpt":"N3"}],
  "kanjiList": [{"kanji":"市","readings":"シ","meaning":"Single String Meaning in ${langGuide}"}],
  "grammarList": [{"grammar":"〜において","explanation":"Single String Explanation in ${langGuide}"}]
}`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    };