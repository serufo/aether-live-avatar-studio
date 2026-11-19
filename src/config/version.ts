/**
 * Controle central da versão de desenvolvimento do Aether Live Studio.
 * Começa em v0 e deve ser incrementada (v1, v2, v3, ...) a cada atualização.
 * Use `npm run bump:dev` para incrementar automaticamente.
 */
export const APP_DEV_VERSION_NUMBER = 2;

export const APP_DEV_VERSION = `v${APP_DEV_VERSION_NUMBER}` as const;

export const APP_DEV_CHANNEL = 'dev' as const;

export const APP_DEV_VERSION_LABEL = `${APP_DEV_CHANNEL} ${APP_DEV_VERSION}` as const;
