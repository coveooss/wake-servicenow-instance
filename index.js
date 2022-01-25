#!/usr/bin/env node
import ora from 'ora';
import { chromium } from 'playwright';
import commandLineArgs from 'command-line-args';

const INSTANCE_WAKE_DELAY = 5000;

const optionDefinitions = [
    { name: 'username', alias: 'u', type: String },
    { name: 'password', alias: 'p', type: String },
    { name: 'headfull', alias: 'v', type: Boolean },
];

// eslint-disable-next-line no-promise-executor-return
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const checkForInstanceWakingUpStatus = async (belowButtonLocator, spinner) => {
    let newSpinner = spinner;
    if (await belowButtonLocator.count() >= 1) {
        if ((await belowButtonLocator.textContent('div.item-in-progress-container')).includes('Waking up instance')) {
            newSpinner = newSpinner.text('Instance is waking');
            await sleep(INSTANCE_WAKE_DELAY);
            newSpinner = await checkForInstanceWakingUpStatus(belowButtonLocator, newSpinner);
        } else if (false) { // TODO: add check for wake error
            newSpinner = newSpinner.fail('Error waking instance')
                .start('Trying to recover');
            // TODO: add recover code
        }
    }
    return newSpinner;
};

(async () => {
    let username;
    let password;
    const { headfull, ...commandLineOptions } = commandLineArgs(optionDefinitions);
    if (process.env.SERVICENOW_USERNAME?.length >= 1) {
        username = process.env.SERVICENOW_USERNAME;
    } else if (commandLineOptions.username.length >= 1) {
        username = commandLineOptions.username;
    } else {
        throw new Error('You need to set a non-null SERVICENOW_USERNAME env variable or pass it as an argument');
    }
    if (process.env.SERVICENOW_PASSWORD?.length >= 1) {
        password = process.env.SERVICENOW_PASSWORD;
    } else if (commandLineOptions.password.length >= 1) {
        password = commandLineOptions.password;
    } else {
        throw new Error('You need to set a non-null SERVICENOW_PASSWORD env variable or pass it as an argument');
    }
    let spinner = ora('Starting ServiceNow waker').start();
    const browser = await chromium.launch({ headless: !headfull });
    const page = await browser.newPage();
    await page.goto('https://developer.servicenow.com/dev.do', {
        timeout: 100000,
    });
    spinner = spinner
        .succeed('Servicenow Developer page opened')
        .start('Logging in with provided credentials');
    await page.click('.dps-button-label');
    await page.type('#username', username);
    await page.click('#usernameSubmitButton');
    await page.waitForResponse('https://signon.service-now.com/xmlhttp.do');
    await page.type('#password', password);
    await page.click('#submitButton');
    if ((await page.textContent('#errorPlaceholder', {
        timeout: 600,
    })).includes('is invalid')) {
        spinner.fail('Invalid username or password');
        process.exit(1);
    }
    await page.locator('.dps-app-bootstrapping dps-spinner').waitFor({
        timeout: 100000,
    });
    spinner = spinner
        .succeed('Logged into your ServiceNow Developer account')
        .start('Loading ServiceNow Developer homepage');
    await page.waitForLoadState('networkidle');
    const belowButtonLocator = page.locator('div[slot="below-button"]');
    spinner = await checkForInstanceWakingUpStatus(belowButtonLocator, spinner);
    await page.click('button.dps-login');
    if ((await page.textContent('p.dps-navigation-instance-status')).includes('Online')) {
        spinner = spinner.succeed('Instance is awake 🎉');
    } else {
        spinner = spinner.fail('Instance is not awake, trying to recover');
        // TODO: add recover code
    }
    await browser.close();
})();
