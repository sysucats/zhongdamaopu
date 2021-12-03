declare namespace MaoPu {
    interface MountData {
        globalData: GlobalData
    }

    interface GlobalData {
        version: string,
        settings?: { [key: string]: any }
    }
    
    interface GetApp {
        (opts?: WechatMiniprogram.App.GetAppOption): WechatMiniprogram.App.Instance<MountData>
    }
}

declare type MaoPuApp= WechatMiniprogram.App.Instance<MaoPu.MountData>
declare let getMaoPuApp:MaoPu.GetApp;