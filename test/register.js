// Lets Node import owner.html and logo.txt as text, the way Wrangler bundles them.
import {register} from 'node:module';
register('./text-loader.js', import.meta.url);
