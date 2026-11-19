/**
 * Controle central da versão de desenvolvimento (pré-lançamento 0.x) do Aether Live Studio.
 * Incrementada em 0.x (v0.1, v0.2, v0.3, ...) a cada atualização antes do lançamento 1.0.
 * Use `npm run bump:dev` para incrementar automaticamente o número minor (0.x -> 0.(x+1)).
 */
export const APP_DEV_VERSION_MAJOR = 0;

export const APP_DEV_VERSION_MINOR = 3;

export const APP_DEV_VERSION = `v${APP_DEV_VERSION_MAJOR}.${APP_DEV_VERSION_MINOR}` as const;

export const APP_DEV_CHANNEL = 'dev' as const;

export const APP_DEV_VERSION_LABEL = `${APP_DEV_CHANNEL} ${APP_DEV_VERSION}` as const;
