'use strict';

require('./load_env');

const OpenAI = require('openai');

const DEFAULT_MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-5-mini';

let client = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Falta configurar OPENAI_API_KEY para usar el asistente IA real');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return client;
}

function getAssistantModel() {
  return process.env.OPENAI_ASSISTANT_MODEL || DEFAULT_MODEL;
}

module.exports = {
  getOpenAIClient,
  getAssistantModel
};
