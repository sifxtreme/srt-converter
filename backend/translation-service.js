import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

class AWSTranslator {
  constructor() {
    this.client = new TranslateClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    });
  }

  async translate(text, targetLanguage) {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: "auto",
      TargetLanguageCode: targetLanguage,
    });

    try {
      const response = await this.client.send(command);
      return response.TranslatedText;
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }
}

export default AWSTranslator;