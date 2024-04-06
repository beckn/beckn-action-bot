import Actions from '../services/Actions.js'
import logger from '../utils/logger.js'
import {
    ITEM_ID,
    ITEM_NAME,
    CAT_ATTR_TAG_RELATIONS,
    NEW_CATALOG_AVAILABLE,
    TRIGGER_BLIZZARD_MESSAGE,
    CANCEL_BOOKING_MESSAGE,
    TOURISM_STRAPI_URL
} from '../utils/constants.js'

const action = new Actions()

const TWILIO_RECEPIENT_NUMBER = process.env.TEST_RECEPIENT_NUMBER
export const cancelBooking = async (req, res) => {
    try {
        const { orderId } = req.body
        if(!orderId){
            return res.status(400).json({message:"Order Id is Required", status:false})
        }
      
        const validOrderId = await action.call_api(`${TOURISM_STRAPI_URL}/orders/${orderId}`,'GET',{},{ Authorization: `Bearer ${process.env.STRAPI_TOURISM_TOKEN}`})
        logger.info(`OrderDetails: ${JSON.stringify(validOrderId)}`)
        if(!validOrderId.status){
            return res.status(400).send({ message: `Invalid Order Id`, status:false })
        }
        const messageBody = CANCEL_BOOKING_MESSAGE;
        const getOrderAddressDetails = await action.call_api(`${TOURISM_STRAPI_URL}/order-addresses?order_id=${orderId}`,'GET',{},{ Authorization: `Bearer ${process.env.STRAPI_TOURISM_TOKEN}`})
        
        const getOrderFulfillmentDetails = await action.call_api(`${TOURISM_STRAPI_URL}/order-fulfillments?order_id=${orderId}`,'GET',{},{ Authorization: `Bearer ${process.env.STRAPI_TOURISM_TOKEN}`})
        if (getOrderFulfillmentDetails.data.data.length) {
            await action.call_api(`${TOURISM_STRAPI_URL}/order-fulfillments/${getOrderFulfillmentDetails.data.data[0].id}`,'PUT',{
                data: {
                    state_code: 'CANCELLED',
                    state_value: 'CANCELLED BY HOTEL',
                },
            },{ Authorization: `Bearer ${process.env.STRAPI_TOURISM_TOKEN}`})
            let statusMessage = "";
            
            if(getOrderAddressDetails.data.data[0].attributes.phone){
                statusMessage = (await action.send_message(`+91${getOrderAddressDetails.data.data[0].attributes.phone}`, messageBody)).deliveryStatus
            }
            else{
                statusMessage = (await action.send_message(TWILIO_RECEPIENT_NUMBER, messageBody)).deliveryStatus
            }
            return res.status(200).send({ message: `Notification ${statusMessage}`, status:true })
        }

        return res.status(200).send({ message: 'Cancel Booking Failed', status:false })
    } catch (error) {
        logger.error(error.message)
        return res.status(400).send({ message: error.message, status:false })
    }
}

export const updateCatalog = async (req, res) => {
    try {
        const { userNo = TWILIO_RECEPIENT_NUMBER } = req.body;
        const messageBody = NEW_CATALOG_AVAILABLE;
        await action.call_api(`${TOURISM_STRAPI_URL}/items/${ITEM_ID}`,'PUT',{
            data: {
                name: ITEM_NAME,
                cat_attr_tag_relations: CAT_ATTR_TAG_RELATIONS,
            },
        },{ Authorization: `Bearer ${process.env.STRAPI_TOURISM_TOKEN}`})
        const notifyResponse = await action.send_message(userNo, messageBody)

        if(!notifyResponse || notifyResponse.deliveryStatus === "failed"){
            throw new Error('Notification Failed')
        }
        return res.status(200).send({ message: 'Catalog Updated', status:true })
    } catch (error) {
        logger.error(error.message)
        return res.status(400).send({ message: error.message, status:false })
    }
}


export const notify = async (req, res) => {
    try {
        const { userNo = TWILIO_RECEPIENT_NUMBER } = req.body;
        const messageBody = req.body.message || TRIGGER_BLIZZARD_MESSAGE;
        const sendWhatsappNotificationResponse = await action.send_message(
            userNo,
            messageBody
        )
        if(sendWhatsappNotificationResponse.deliveryStatus === "failed"){
            return res.status(400).json({...sendWhatsappNotificationResponse, status:false})
        }
        sendWhatsappNotificationResponse.deliveryStatus = 'delivered'
        return res.status(200).json({...sendWhatsappNotificationResponse, status:true})
    } catch (error) {
        logger.error(error.message)
        return res.status(400).send({ message: error.message, status:false })
    }
}