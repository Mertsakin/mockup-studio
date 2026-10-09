import {buildBrowser} from './browser.js';
import {buildCustom} from './custom.js';
import {buildLaptop} from './laptop.js';
import {buildMonitor} from './monitor.js';
import {buildPhone} from './phone.js';
import {buildTablet} from './tablet.js';

const BUILDERS={phone:buildPhone,tablet:buildTablet,laptop:buildLaptop,monitor:buildMonitor,browser:buildBrowser,custom:buildCustom};

export {BUILDERS};
