import development from './development.json';
import production from './production.json';

const configuration = {
    development,
    production
};
const possibleEnvironments = ['development', 'production'];
const env = process.env.NODE_ENV as ('development' | 'production');
const disableExtensions = process.argv.slice(2)[0]?.split('=')[1] === 'true';

if (env === undefined) {
    throw new Error('Environment not specified');
}
if (!possibleEnvironments.includes(env)) {
    throw new Error(`Unknwon environment ${env}`);
}

export default { ...configuration[env], env: env, disableExtensions };