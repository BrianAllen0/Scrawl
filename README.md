# Scrawl - A notes app for daily, hand-written notes

Scrawl is a small notes app that replaces the kinds of daily notes you might write by hand. It contains general notes, a grocery list, and a todo list.

I built this app primarily for my own needs. Features are light and simple. There is an import/export feature and all data is stored locally.

## What's in it

**Notes**
- Free-form notes written in Markdown, which open rendered and switch to editing with one tap
- The note at the top of the list is shown as a pinned card with a preview of its contents. Scroll the list and the card rolls over to whichever note reaches the top
- Drag to reorder, and drag a note up into the preview card to make it the first note

**Groceries**
- Check items off, adjust quantities, and rename items in place
- Drag to reorder

**Todos**
- Todos grouped into collapsible category sections, with an optional due date and description
- Checked-off todos move to a Completed section, most recent first
- Dragging a todo into another section moves it to that category

**Everywhere**
- Long press to select several items and delete them together
- Everything saves as you type and stays on the device in a local SQLite database
- Follows the system light/dark theme

## Built with

- [Expo](https://expo.dev) (SDK 57) and React Native, with Expo Router and native tabs
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for storage
- [react-native-reorderable-list](https://github.com/omahili/react-native-reorderable-list), Reanimated and Gesture Handler for drag-to-reorder and animation
- [react-native-marked](https://github.com/gmsgowtham/react-native-marked) for Markdown rendering
- TypeScript and ESLint

## Running it locally

```bash
npm install
npx expo start
```

Then open it in Expo Go or a development build. `./dev.sh` starts an Android emulator and the dev server together.

## Building an Android APK

You can build a standalone APK locally without an Expo account. This requires the Android SDK and JDK 17.

```bash
npx expo prebuild -p android
cd android
./gradlew assembleRelease
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. Copy it to your phone and open it to install, allowing installs from unknown sources when prompted.

- To build only for 64-bit ARM, which covers most modern phones and gives a much smaller APK, add `-PreactNativeArchitectures=arm64-v8a` to the Gradle command.
- The release build is signed with the default debug key, which is fine for personal use. Updates install over the existing app as long as you build on the same machine.
- After code changes, re-run `./gradlew assembleRelease`. Re-run `npx expo prebuild -p android --clean` only after changing `app.json` or adding a native dependency.
- `prebuild` changes the `android` and `ios` scripts in `package.json` to `expo run:*`. Revert that change if you want to keep using Expo Go.

## License

[MIT](LICENSE)
