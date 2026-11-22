// Lets Node import owner.html as text, the way Wrangler bundles it.
import {register} from 'node:module';
register('./text-loader.js', import.meta.url);
