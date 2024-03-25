import * as chai from 'chai'
const expect = chai.expect
import ActionService from '../../../services/Actions.js'
import { describe } from 'mocha'
const actionsService = new ActionService()

describe('Test cases for services/actions.js', () => {
      describe('should test process_instruction()', ()=> {
        it('should process the instruction message', async () => {
          const messageBody = 'test message';
          const result = await actionsService.process_instruction(messageBody);
          expect(result).to.equal('You said "test message"');
        });
      })

      describe('should test send_message()', () => {
        it('should test send a message via Twilio', async () => {
          const recipient = process.env.TEST_MOBILE_NUMBER;
          const message = "hi, this is a test message";
    
          try {
            await actionsService.send_message(recipient, message);
    
          } catch (error) {
            throw new Error('Message sending failed');
          }
        });
    
        it('should throw an error for invalid recipient', async () => {
          const recipient = '';
          const message = 'Test message';

          try {
            await actionsService.send_message(recipient, message);
            throw new Error('Expected an error to be thrown');
          } catch (error) {

            expect(error).to.be.an.instanceOf(Error);
          }
        });
    
        it('should throw an error for empty message', async () => {
          const recipient = process.env.TEST_MOBILE_NUMBER;
          const message = '';
    
          try {
            await actionsService.send_message(recipient, message);
            throw new Error('Expected an error to be thrown');
          } catch (error) {

            expect(error).to.be.an.instanceOf(Error);
          }
        });
      });
})