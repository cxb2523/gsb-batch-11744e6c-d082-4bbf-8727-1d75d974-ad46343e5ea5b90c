import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  TFL_APP_KEY: {
    schema: (value) => value || undefined,
    description: 'Optional TfL API key, which only raises the rate limit'
  }
});
