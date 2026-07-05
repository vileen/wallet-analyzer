import { findLBUZPool } from '../src/tokenResolver';

async function test() {
  // Known example from user
  const mint1 = 'Eb2zbWj8a9oes8t4DC1kjuQEPWgjYCgjGSXqLoLpump';
  const expected1 = '2rbQK5tCpnD2UdXbHvMLUKWhyMN6EHfcnttA6954U99C';

  console.log('Testing known example...');
  const pool1 = await findLBUZPool(mint1);
  console.log(`Mint: ${mint1}`);
  console.log(`Expected: ${expected1}`);
  console.log(`Got: ${pool1}`);
  console.log(`Match: ${pool1 === expected1}`);
  console.log();

  // Test the user's problematic token
  const mint2 = 'AyLn7YdHqh3pGSNC1YrdEtEdSCVjG7BxQedxBvkTpump';
  console.log('Testing problematic token...');
  const pool2 = await findLBUZPool(mint2);
  console.log(`Mint: ${mint2}`);
  console.log(`Got: ${pool2}`);
}

test().catch(console.error);
