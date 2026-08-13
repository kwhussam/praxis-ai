#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PraxisShieldNetworkProbe, NSObject)

RCT_EXTERN_METHOD(getWifiSecurityDetails:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(probeTcpPorts:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(probeSsdp:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
