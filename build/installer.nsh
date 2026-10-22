; Removes the "Open with Markloom" Explorer menu (Settings > Window) on a real uninstall.
; An update runs the old uninstaller too; the menu must survive that.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\Markloom"
    DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\Markloom"
    DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.mdx\shell\Markloom"
    DeleteRegKey HKCU "Software\Classes\Directory\shell\Markloom"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Markloom"
  ${endIf}
!macroend
