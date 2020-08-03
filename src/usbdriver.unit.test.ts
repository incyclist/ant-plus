import {USBDriver} from './ant'
const usb = require( 'usb')

const GarminStick2 = {
    busNumber: 1,
    deviceAddress: 3,
    deviceDescriptor: {
      bLength: 18,
      bDescriptorType: 1,
      bcdUSB: 512,
      bDeviceClass: 0,
      bDeviceSubClass: 0,
      bDeviceProtocol: 0,
      bMaxPacketSize0: 32,
      idVendor: 4047,
      idProduct: 4104,
      bcdDevice: 256,
      iManufacturer: 1,
      iProduct: 2,
      iSerialNumber: 3,
      bNumConfigurations: 1
    },
    portNumbers: [ 6 ]
};

const GarminStick3 = {
    busNumber: 1,
    deviceAddress: 4,
    deviceDescriptor: {
      bLength: 18,
      bDescriptorType: 1,
      bcdUSB: 512,
      bDeviceClass: 0,
      bDeviceSubClass: 0,
      bDeviceProtocol: 0,
      bMaxPacketSize0: 32,
      idVendor: 4047,
      idProduct: 4105,
      bcdDevice: 256,
      iManufacturer: 1,
      iProduct: 2,
      iSerialNumber: 3,
      bNumConfigurations: 1
    },
    portNumbers: [ 6 ]
};


describe ( 'usbdriver', ()=> {
    let fnGetDeviceList;
    beforeEach( ()=> {
        fnGetDeviceList = usb.getDeviceList
    })

    afterEach( ()=> {
        usb.getDeviceList = fnGetDeviceList;
    })

    describe( 'getDevices()', ()=> {

        test( 'Garmin Stick2',() => {
            usb.getDeviceList = jest.fn( ()=> [GarminStick2])
            const res = USBDriver.listDevices();
            expect(res.length).toBe(1);
        })

        test( 'Garmin Stick2',() => {
            usb.getDeviceList = jest.fn( ()=> [GarminStick2])
            const res = USBDriver.listDevices( (d)=> d.deviceDescriptor.idVendor === 0x0fcf && d.deviceDescriptor.idProduct === 0x1008);
            expect(res.length).toBe(1);
            console.log(res)

        })


    } )
})