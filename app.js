const { App } = require('@slack/bolt');
require('dotenv').config();
const cron = require('node-cron');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const onboardingDB = {};

// Time Constants (Testing ke liye aap inhein adjust kar sakte hain)
const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

// 1. HR Slash Command - HR fills only Name, Dept, and Team Leader
app.command('/onboard', async ({ ack, body, client }) => {
  await ack();
  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'hr_onboard_modal',
        title: { type: 'plain_text', text: 'New Hire Onboarding' },
        submit: { type: 'plain_text', text: 'Send to Team Lead' },
        blocks: [
          {
            type: 'input',
            block_id: 'full_name_block',
            element: { type: 'plain_text_input', action_id: 'full_name_input' },
            label: { type: 'plain_text', text: "1. What is the employee’s full name?" }
          },
          {
            type: 'input',
            block_id: 'dept_block',
            element: {
              type: 'static_select',
              action_id: 'dept_select',
              placeholder: { type: 'plain_text', text: 'Select Department' },
              options: [
                { text: { type: 'plain_text', text: 'Sales' }, value: 'Sales' },
                { text: { type: 'plain_text', text: 'Marketing' }, value: 'Marketing' },
                { text: { type: 'plain_text', text: 'Admin' }, value: 'Admin' },
                { text: { type: 'plain_text', text: 'Academic Counselling' }, value: 'Academic Counselling' },
                { text: { type: 'plain_text', text: 'Teaching' }, value: 'Teaching' },
                { text: { type: 'plain_text', text: 'Curriculum Development' }, value: 'Curriculum Development' },
                { text: { type: 'plain_text', text: 'Tech department' }, value: 'Tech department' }
              ]
            },
            label: { type: 'plain_text', text: "2. Which department will the employee be joining?" }
          },
          {
            type: 'input',
            block_id: 'tl_block',
            element: {
              type: 'static_select',
              action_id: 'tl_select',
              placeholder: { type: 'plain_text', text: 'Select Team Leader' },
              options: [
                { text: { type: 'plain_text', text: 'Sobia Mateen' }, value: 'U0BMA619H0B' },
                { text: { type: 'plain_text', text: 'Nasreen' }, value: 'U062DJ39N69' },
                { text: { type: 'plain_text', text: 'Ambreen' }, value: 'U062V5XTB5X' },
                { text: { type: 'plain_text', text: 'Eman' }, value: 'U062GKM4WAE' },
                { text: { type: 'plain_text', text: 'Mahek' }, value: 'U062V57EC3B' },
                { text: { type: 'plain_text', text: 'Mahum' }, value: 'U07CS5S55C1' }
              ]
            },
            label: { type: 'plain_text', text: "3. Who will be the employee’s assigned Team Leader?" }
          }
        ]
      }
    });
  } catch (error) {
    console.error(error);
  }
});

// 2. HR Form Submission & TL DM Notification + Timestamp Save
app.view('hr_onboard_modal', async ({ ack, body, view, client }) => {
  await ack();

  const fullName = view.state.values.full_name_block.full_name_input.value;
  const dept = view.state.values.dept_block.dept_select.selected_option.value;
  const teamLeadId = view.state.values.tl_block.tl_select.selected_option.value;
  const teamLeadName = view.state.values.tl_block.tl_select.selected_option.text.text;
  const hrUserId = body.user.id;

  const recordId = `onboard_${Date.now()}`;
  const currentTime = Date.now();

  onboardingDB[recordId] = { 
    fullName, 
    dept, 
    teamLeadId, 
    teamLeadName, 
    hrUserId, 
    status: 'PENDING_TL',
    createdAt: currentTime,
    reminder6hSent: false,
    reminder24hSent: false
  };

  try {
    await client.chat.postMessage({
      channel: teamLeadId,
      text: `New Onboarding Assignment: ${fullName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `👋 *New Employee Onboarding Assigned*\n\n*Name:* ${fullName}\n*Department:* ${dept}\n\nPlease click below to fill in the remaining details.`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Complete Details' },
              style: 'primary',
              action_id: 'open_tl_modal',
              value: recordId
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error(error);
  }
});

// 3. Cron Job: Runs every minute to check pending forms and send reminders
cron.schedule('* * * * *', async () => {
  const now = Date.now();

  for (const recordId in onboardingDB) {
    const record = onboardingDB[recordId];

    if (record.status === 'PENDING_TL') {
      const timePassed = now - record.createdAt;

      // Testing ke liye yahan time adjust kiya ja sakta hai (Maslan: 30 minutes = THIRTY_MINUTES)
      // Original 6 hours check: timePassed >= (6 * ONE_HOUR)
      // Testing ke liye aap ise chhota kar sakti hain, e.g., THIRTY_MINUTES
      if (timePassed >= THIRTY_MINUTES && !record.reminder6hSent) {
        try {
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: record.teamLeadId,
            text: `⏳ *Reminder:* Please complete the onboarding details for *${record.fullName}* (${record.dept}).`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `⏳ *Onboarding Reminder*\n\nThis is a reminder to fill out the remaining onboarding details for *${record.fullName}*.`
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Complete Details Now' },
                    style: 'primary',
                    action_id: 'open_tl_modal',
                    value: recordId
                  }
                ]
              }
            ]
          });
          record.reminder6hSent = true;
          console.log(`Cron reminder sent for: ${record.fullName}`);
        } catch (err) {
          console.error('Error sending cron reminder:', err);
        }
      }

      // 24 Hours Urgent Reminder check (Ya test ke liye 1 hour)
      if (timePassed >= (24 * ONE_HOUR) && !record.reminder24hSent) {
        try {
          await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: record.teamLeadId,
            text: `⏰ *Urgent Reminder:* Onboarding for *${record.fullName}* is still pending!`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `⏰ *24-Hour Urgent Reminder*\n\nIt has been 24 hours and the onboarding details for *${record.fullName}* are still pending. Please submit them to HR immediately.`
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Complete Details Now' },
                    style: 'danger',
                    action_id: 'open_tl_modal',
                    value: recordId
                  }
                ]
              }
            ]
          });
          record.reminder24hSent = true;
          console.log(`24-hour cron reminder sent for: ${record.fullName}`);
        } catch (err) {
          console.error('Error sending 24h cron reminder:', err);
        }
      }
    }
  }
});

// 4. Team Lead Modal Open
app.action('open_tl_modal', async ({ ack, body, client }) => {
  await ack();
  const recordId = body.actions[0].value;
  const record = onboardingDB[recordId];

  if (!record || record.status === 'COMPLETED') {
    try {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `⚠️ This onboarding form has already been submitted.`
      });
    } catch (e) {}
    return;
  }

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'tl_onboard_modal',
        private_metadata: recordId,
        title: { type: 'plain_text', text: 'Complete Onboarding' },
        submit: { type: 'plain_text', text: 'Submit to HR' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Employee:* ${record.fullName}\n*Department:* ${record.dept}`
            }
          },
          {
            type: 'input',
            block_id: 'title_block',
            element: { type: 'plain_text_input', action_id: 'title_input' },
            label: { type: 'plain_text', text: "What is the employee’s job title/designation?" }
          },
          {
            type: 'input',
            block_id: 'channels_block',
            element: { type: 'plain_text_input', action_id: 'channels_input', placeholder: { type: 'plain_text', text: '#general, #dev-team' } },
            label: { type: 'plain_text', text: "Which Slack channels should the employee be added to?" }
          },
          {
            type: 'input',
            block_id: 'joining_date_block',
            element: { type: 'datepicker', action_id: 'joining_date_input' },
            label: { type: 'plain_text', text: "What is the employee’s confirmed joining date?" }
          },
          {
            type: 'input',
            block_id: 'joining_time_block',
            element: { type: 'timepicker', action_id: 'joining_time_input' },
            label: { type: 'plain_text', text: "What time will the employee be joining?" }
          },
          {
            type: 'input',
            block_id: 'software_block',
            element: {
              type: 'multi_static_select',
              action_id: 'software_select',
              placeholder: { type: 'plain_text', text: 'Choose multiple software...' },
              options: [
                { text: { type: 'plain_text', text: 'New Account on Portal' }, value: 'portal_account' },
                { text: { type: 'plain_text', text: 'Admin Email (HR)' }, value: 'admin_email' },
                { text: { type: 'plain_text', text: 'Support Email (C.S)' }, value: 'support_email' },
                { text: { type: 'plain_text', text: 'HubSpot' }, value: 'hubspot' },
                { text: { type: 'plain_text', text: 'PayAdvantage' }, value: 'payadvantage' },
                { text: { type: 'plain_text', text: 'Careers WhatsApp' }, value: 'careers_whatsapp' },
                { text: { type: 'plain_text', text: 'Admin WhatsApp' }, value: 'admin_whatsapp' },
                { text: { type: 'plain_text', text: 'Sales WhatsApp' }, value: 'sales_whatsapp' },
                { text: { type: 'plain_text', text: 'Canva' }, value: 'canva' },
                { text: { type: 'plain_text', text: 'Capcut' }, value: 'capcut' }
              ]
            },
            label: { type: 'plain_text', text: "Select Required Software/Portals" }
          },
          {
            type: 'input',
            block_id: 'other_software_block',
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'other_software_input',
              placeholder: { type: 'plain_text', text: 'Type software names here if not in the list...' }
            },
            label: { type: 'plain_text', text: "If not mentioned above, please add your required software access:" }
          },
          {
            type: 'input',
            block_id: 'docs_block',
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'docs_input',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Paste document links here...' }
            },
            label: { type: 'plain_text', text: "Any documents you’d like them to read, please link them here:" }
          }
        ]
      }
    });
  } catch (error) {
    console.error(error);
  }
});

// 5. Team Lead Submission & Final HR Summary Alert
app.view('tl_onboard_modal', async ({ ack, body, view, client }) => {
  await ack();
  const recordId = view.private_metadata;
  
  const title = view.state.values.title_block.title_input.value;
  const channels = view.state.values.channels_block.channels_input.value;
  const joiningDate = view.state.values.joining_date_block.joining_date_input.selected_date;
  const joiningTime = view.state.values.joining_time_block.joining_time_input.selected_time;
  
  const selectedSoftwareOptions = view.state.values.software_block.software_select.selected_options;
  const software = (selectedSoftwareOptions && selectedSoftwareOptions.length > 0) 
    ? selectedSoftwareOptions.map(opt => opt.text.text).join(', ') 
    : 'None';
  
  const otherSoftwareBlock = view.state.values.other_software_block.other_software_input;
  const otherSoftware = (otherSoftwareBlock && otherSoftwareBlock.value) ? otherSoftwareBlock.value : 'None';

  const docsBlock = view.state.values.docs_block.docs_input;
  const docLinks = (docsBlock && docsBlock.value) ? docsBlock.value : 'None';

  if (onboardingDB[recordId]) {
    onboardingDB[recordId].title = title;
    onboardingDB[recordId].channels = channels;
    onboardingDB[recordId].joiningDate = joiningDate;
    onboardingDB[recordId].joiningTime = joiningTime;
    onboardingDB[recordId].software = software;
    onboardingDB[recordId].otherSoftware = otherSoftware;
    onboardingDB[recordId].docLinks = docLinks;
    onboardingDB[recordId].status = 'COMPLETED';

    const record = onboardingDB[recordId];

    try {
      await client.chat.postMessage({
        channel: record.hrUserId,
        text: `Onboarding completed for *${record.fullName}*!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Onboarding Process Completed!*\n\n*Name:* ${record.fullName}\n*Title:* ${record.title}\n*Department:* ${record.dept}\n*Assigned Lead:* ${record.teamLeadName}\n*Joining Date:* ${record.joiningDate} @ ${record.joiningTime}\n*Slack Channels:* ${record.channels}\n*Selected Software:* ${record.software}\n*Other Software:* ${record.otherSoftware}\n*Documents to Read:* ${record.docLinks}`
            }
          }
        ]
      });
    } catch (error) {
      console.error(error);
    }
  }
});

(async () => {
  await app.start();
  console.log('⚡️ Slack Onboarding App is running with Cron-based Reminders!');
})();