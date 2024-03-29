import twilio from 'twilio'
import logger from '../utils/logger.js'
import axios from 'axios'
import AI from './AI.js'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioNumber = process.env.TWILIO_NUMBER

const client = twilio(accountSid, authToken)

class Actions {
    
    constructor() {
        this.ai = new AI()
        this.context = [];
    }
    
    async call_api(endpoint, method, data, headers = {}) {
        logger.info(`Calling ${method} on ${endpoint}...`);
        logger.info(`Data: ${JSON.stringify(data, null, 2)}`);
        let responseObject = {
            status: false,
            retry: false,
        }
        // convert headers to json if it's a string
        if (typeof headers === 'string') headers = JSON.parse(headers)
        const request = { url: endpoint, method, data, headers }
        
        try {
            const response = await axios(request)
            
            responseObject = {
                status: true,
                data: response.data,
                cookies: response.headers['set-cookie'],
            }
            logger.info(`API call was successful: , response.status`)
            logger.info(JSON.stringify(response.data, null, 2))
        } catch (error) {
            logger.error(error)
            
            // Something happened in setting up the request that triggered an Error
            logger.error('Error', error.message)
            responseObject.error = error.message
        }
        return responseObject
    }
    
    async process_instruction(message, context=[]) {
        let response = {
            status: false,
            formatted: 'Failed to process the instruction',
        }
        try {

            // Get becnk request from text message
            const beckn_request = await this.ai.get_beckn_request_from_text(message, context);
            if(!beckn_request.status){
                response.formatted = beckn_request.message;              
            }
            else{
                // Call the API
                logger.info(`Making api call...`)
                const call_api_response = await this.call_api(beckn_request.data.url, beckn_request.data.method, beckn_request.data.body, beckn_request.data.headers)
                if(!call_api_response.status){
                    response.formatted = `Failed to call the API: ${call_api_response.error}`
                    response.data = call_api_response.data              
                }
                else{

                    logger.info(`API call successful. Compessing search results in case of search...`)
                    response = {
                        status: true,
                        raw: beckn_request.data.body.context.action==='search' ? await this.ai.compress_search_results(call_api_response.data) : call_api_response.data
                    }

                    // Format the response
                    logger.info(`Formatting response...`);
                    const get_text_from_json_response = await this.ai.get_text_from_json(
                        call_api_response.data,
                        [...context, { role: 'user', content: message }]
                    )
                    response.formatted = get_text_from_json_response.message
                }                
            }            
        } catch (error) {
            logger.error(`Error processing instruction: ${error.message}`)
            response.formatted = `Failed to process the instruction: ${error.message}`
        }
        
        return response;
    }
    
    async send_message(recipient, message) {
        try {
            
            const response = await client.messages.create({
                body: message,
                from: `whatsapp:${twilioNumber}`,
                to: recipient.includes('whatsapp:') ? recipient : `whatsapp:${recipient}`,
            })
            logger.info(`Message sent: ${JSON.stringify(response)}`)
            return true;
        } catch (error) {
            logger.error(`Error sending message: ${error.message}`)           
            return false;
        }
    }
}

export default Actions
