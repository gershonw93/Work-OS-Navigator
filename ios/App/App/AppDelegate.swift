import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // ─────────────────────────────────────────────────────────────────────
    // THE PUSH TOKEN ARRIVES HERE, AND NOWHERE ELSE.
    //
    // THE BUG. Permission granted, `PushNotifications.register()` called, and
    // `device_tokens` empty - with no error anywhere, on either side. This is
    // why: `register()` calls UIApplication.registerForRemoteNotifications(),
    // Apple answers by calling the two methods below on the app delegate, and
    // they did not exist. The token was delivered to nobody. The failure case
    // went the same way, which is why `registrationError` never fired either
    // and the JavaScript had nothing to report but silence.
    //
    // Capacitor cannot add these for you - `npx cap sync` writes the Podfile
    // and the plugin, but the app delegate is YOUR file. Forwarding the result
    // onto NotificationCenter is what lets the plugin turn it into the
    // `registration` / `registrationError` events lib/use-push.ts listens for.
    //
    // Delete either one and push stops working with no error at all.
    // ─────────────────────────────────────────────────────────────────────
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// ─────────────────────────────────────────────────────────────────────────
// SWIPE FROM THE LEFT EDGE TO GO BACK - the gesture every iPhone app has.
//
// WKWebView can do it itself, interactively, with the system's own
// slide-and-snapshot animation: `allowsBackForwardNavigationGestures`. It is
// off by default, and off is the single clearest tell that an app is a
// website in a wrapper. The web app carries its own JavaScript version of the
// gesture (lib/use-swipe-back.ts) for Safari, Android and any phone still on
// a build from before this line; inside the shell the system gesture takes the
// edge touch first, so the two never fight.
//
// Back-forward here is the webview's history, which includes every soft
// navigation the Next router pushes - so this goes exactly where the in-app
// back goes, one screen at a time, never out to a blank page.
//
// A SUBCLASS, because the storyboard instantiates the view controller and
// nothing else in the app ever holds a reference to it. `capacitorDidLoad()`
// is the override point Capacitor documents (the webview exists by then;
// `viewDidLoad` is where it is created). It lives in this file rather than
// its own so it needs no entry in project.pbxproj - a Swift file the project
// does not list is a file Xcode does not compile, silently.
// Main.storyboard points at it: customClass="SyteNavViewController".
//
// NEEDS AN IOS REBUILD TO TAKE EFFECT. Pinned in lib/__tests__/swipe-back.ts.
// ─────────────────────────────────────────────────────────────────────────
class SyteNavViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
    }
}
