import { readFileSync } from 'fs'
import OpenAI from 'openai'
import logger from '../utils/logger.js'
import yaml from 'js-yaml'
import { v4 as uuidv4 } from 'uuid'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_AI_KEY,
})
const config = JSON.parse(readFileSync('./config/openai.json'))

class AI {
    constructor() {
        this.context = []
    }

    /**
     * Function to retuen a beckn action from given text.
     * It should return a chat completion response if no action is found.
     * @param {*} text
     * @returns
     */

    async get_message_from_beckn_response(json_response) {
        const openai_messages = [
            {
                role: 'system',
                content: `You must validate this JSON object structure ${JSON.stringify(json_response)}. If JSON object is empty return a response in JSON object format {success:false, message:Empty JSON}. And if the JSON is invalid you should create an error message and set that in the message key of JSON object {success:false}. If its valid then create a meaningful text message containing all the information present in this json ${JSON.stringify(json_response)} based on the action description in the responses array of the json and return the message `,
            },
        ]
        let response = {
            action: null,
            response: null,
        }
        try {
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID,
                temperature: 0,
                response_format: { type: 'json_object' },
            })
            response = JSON.parse(completion.choices[0].message.content)
            if (!response.success) {
                throw new Error(response.message || 'Invalid JSON')
            }
        } catch (e) {
            logger.error(e)
        }
        return response
    }
    async get_beckn_action_from_text(text) {
        const openai_messages = [
            {
                role: 'system',
                content: `Your job is to analyse the text input given by user and identify if that is an action based on given set of actions. The supported actions with their descriptions are : ${JSON.stringify(config.SUPPORTED_ACTIONS)}.`,
            },
            {
                role: 'system',
                content: `You must return a json in the following format {'action':'SOME_ACTION_OR_NULL', 'response': 'Should be reponse based on the query.'}`,
            },
            {
                role: 'system',
                content: `If the instruction is an action, the action key should be set under 'action' otehrwise action should be null and response should contain completion for the given text.`,
            },
            {
                role: 'system',
                content: `If you are asked to prepare an itinery or plan a trip, always ask for user preferences such as accommodation types, journey details, dietary preferences, things of interest, journey dates, journey destination, number of members, special requests.`,
            },
            { role: 'user', content: text },
        ]

        let response = {
            action: null,
            response: null,
        }
        try {
            const completion = await openai.chat.completions.create({
                messages: openai_messages,
                model: process.env.OPENAI_MODEL_ID,
                temperature: 0,
                response_format: { type: 'json_object' },
            })
            response = JSON.parse(completion.choices[0].message.content)
        } catch (e) {
            logger.error(e)
        }
        return response
    }

    async get_beckn_request_from_text(instruction, context = []) {
        let action_response = {
            status: false,
            data: null,
            message: null,
        }

        // Preparse presets
        let presets = {
            ...config.PRESETS,
            domain: 'Any of these : uei:charging',
            message_id: uuidv4(),
            transaction_id: uuidv4(),
            action: `Any of these : ${JSON.stringify(config.SUPPORTED_DOMAINS.map((item) => item.key))}`,
        }

        // get the right/compressed schema
        const schema_response =
            await this._get_schema_by_instruction(instruction)
        const schema = schema_response.data

        // If its a valid action
        if (schema_response.status) {
            let openai_messages = [
                {
                    role: 'system',
                    content: `Schema definition: ${JSON.stringify(schema)}`,
                },
                ...config.SCHEMA_TRANSLATION_CONTEXT,
                {
                    role: 'system',
                    content: `Use the following presets to fill the context : ${JSON.stringify(presets)}`,
                },
                ...context,
                { role: 'user', content: instruction },
            ]

            try {
                const completion = await openai.chat.completions.create({
                    messages: openai_messages,
                    model: process.env.OPENAI_MODEL_ID,
                    response_format: { type: 'json_object' },
                    temperature: 0,
                })
                const jsonString = completion.choices[0].message.content.trim()
                logger.info(jsonString)
                logger.info(
                    `\u001b[1;34m ${JSON.stringify(completion.usage)}\u001b[0m`
                )

                const response = JSON.parse(jsonString)
                response.url = `${config.PRESETS.base_url}/${response.body.context.action}`
                action_response = {
                    ...action_response,
                    status: true,
                    data: response,
                }
            } catch (e) {
                logger.error(e)
                action_response = { ...action_response, message: e.message }
            }
        } else {
            action_response = {
                ...action_response,
                message: schema_response.message,
            }
        }

        return action_response
    }

    async compress_search_results(search_res) {
        const desired_output = {
            providers: [
                {
                    id: 'some_provider_id',
                    name: 'some_provider_name',
                    items: [
                        {
                            id: 'some_item_id',
                            name: 'some_item_name',
                        },
                    ],
                },
            ],
        }
        let openai_messages = [
            {
                role: 'system',
                content: `Your job is to complress the search results received from user into the following JSON structure : ${JSON.stringify(desired_output)}`,
            },
            {
                role: 'system',
                content:
                    'you should not send providers that do not have items.',
            },
            { role: 'user', content: JSON.stringify(search_res) },
        ]
        const completion = await openai.chat.completions.create({
            messages: openai_messages,
            model: process.env.OPENAI_MODEL_ID,
            response_format: { type: 'json_object' },
            temperature: 0,
        })
        const jsonString = completion.choices[0].message.content.trim()
        logger.info(jsonString)
        logger.info(`\u001b[1;34m ${JSON.stringify(completion.usage)}\u001b[0m`)

        const compressed = JSON.parse(jsonString)
        return { ...search_res, responses: compressed }
    }

    async _get_schema_by_instruction(instruction) {
        let response = {
            status: false,
            data: null,
            message: null,
        }
        const action = await this.get_beckn_action_from_text(instruction)
        if (action?.action) {
            try {
                const filePath = `./schemas/core_1.1.0/${action?.action}.yml`
                const schema = yaml.load(readFileSync(filePath, 'utf8'))
                response = { ...response, status: true, data: schema }
            } catch (error) {
                const defaultFilePath = './schemas/core_1.1.0.yml'
                const defaultSchema = yaml.load(
                    readFileSync(defaultFilePath, 'utf8')
                )

                // Reduce schema
                const specificSchema = JSON.stringify(
                    defaultSchema.paths[`/${action.action}`]
                )
                if (specificSchema) {
                    defaultSchema.paths = {
                        [`/${action.action}`]: specificSchema,
                    }
                }

                response = { ...response, status: true, data: defaultSchema }
            }
        } else {
            response = { ...response, message: action.response }
        }
        return response
    }
}

export default AI
