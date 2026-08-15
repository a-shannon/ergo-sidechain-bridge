import { basename, extname } from 'path';

const envFileName = '.' + 'env';
const secretDlogFileName = `secrets.${'dlog'}`;
const runtimeDatabaseExtensions = new Set(['.db', '.sqlite', '.sqlite3']);
const maxEvidenceTargetDecodeDepth = 12;
const asciiControlPattern = /[\u0000-\u001f\u007f]/g;
const unicodeFormatControlPattern = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
const unicodeFormatControlCodePointPattern = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u;
const namedUnicodeDigitValues = new Map<string, string>([
  ['ZERO', '0'],
  ['ONE', '1'],
  ['TWO', '2'],
  ['THREE', '3'],
  ['FOUR', '4'],
  ['FIVE', '5'],
  ['SIX', '6'],
  ['SEVEN', '7'],
  ['EIGHT', '8'],
  ['NINE', '9'],
]);
const namedUnicodeLatinLigatureValues = new Map<string, string>([
  ['LATIN SMALL LIGATURE FF', 'ff'],
  ['LATIN SMALL LIGATURE FI', 'fi'],
  ['LATIN SMALL LIGATURE FL', 'fl'],
  ['LATIN SMALL LIGATURE FFI', 'ffi'],
  ['LATIN SMALL LIGATURE FFL', 'ffl'],
  ['LATIN SMALL LIGATURE ST', 'st'],
]);
const namedUnicodeCompatibilityPathMarkerValues = new Map<string, string>([
  ['FULLWIDTH COLON', ':'],
  ['FULLWIDTH FULL STOP', '.'],
  ['FULLWIDTH REVERSE SOLIDUS', '\\'],
  ['FULLWIDTH SOLIDUS', '/'],
  ['PRESENTATION FORM FOR VERTICAL COLON', ':'],
  ['PRESENTATION FORM FOR VERTICAL FULL STOP', '.'],
  ['SMALL COLON', ':'],
  ['SMALL FULL STOP', '.'],
  ['SMALL REVERSE SOLIDUS', '\\'],
]);
const runtimeDatabasePathPattern = /\.(?:db|sqlite|sqlite3)(?:$|[./_?#-])/;
const secretBearingPathPattern =
  /(?:^|[/_. -])(?:secret|secrets|mnemonic|wallet|keystore|keyfile|private[-_ ]?key|signing[-_ ]?key|api[-_ ]?key|seed[-_ ]?phrase)(?:$|[/_. -])/i;
const localOnlyVariableNamePattern =
  '(?:home|userprofile|homepath|pwd|cd|tmp|temp|tmpdir|appdata|localappdata|homedrive|systemdrive|' +
  'xdg_runtime_dir|xdg_config_home|xdg_cache_home|xdg_data_home|' +
  'programfiles(?:\\(x86\\))?|commonprogramfiles(?:\\(x86\\))?|programdata|public|allusersprofile|' +
  'systemroot|windir|onedrive(?:commercial|consumer)?|profile|psscriptroot|pscommandpath|pshome)';
const localOnlyReferenceBoundaryPattern = `(?:[\\s)"'\\],;|<>\\x60]|[/\\\\]|[?#&]|$)`;
const adjacentLocalPathLikeSuffixPattern =
  `[^\\s)"'\\],;/:\\\\|&<>][^\\s)"'\\],;/:\\\\|&<>]*\\.[a-z0-9][a-z0-9_-]*${localOnlyReferenceBoundaryPattern}`;
const localOnlyPathResultBoundaryPattern = `(?:${localOnlyReferenceBoundaryPattern}|${adjacentLocalPathLikeSuffixPattern})`;
const shellLocalOnlyParameterExpansionPattern =
  `\\$\\{(?:env:)?${localOnlyVariableNamePattern}(?:\\}|[^a-z0-9_}][^}]*\\})${localOnlyReferenceBoundaryPattern}`;
const powerShellRelativeDirectoryValuePattern = `(?:\\.\\.?|"\\.\\.?"|'\\.\\.?')`;
const powerShellRelativeDirectoryArgumentPattern =
  `(?:\\s+-(?:literalpath|path))?\\s+${powerShellRelativeDirectoryValuePattern}`;
const powerShellLocationCommandNamePattern = '(?:pwd|get-location|gl)';
const powerShellPathResolutionCommandNamePattern = '(?:realpath|resolve-path|convert-path|rvpa|cvpa)';
const powerShellItemCommandNamePattern = '(?:get-item|gi)';
const powerShellPipelinePropertyCommandNamePattern = '(?:foreach-object|foreach|%)';
const powerShellJoinPathCurrentDirectoryPattern =
  `\\$\\(\\s*join-path(?:\\s+${powerShellRelativeDirectoryValuePattern}(?:\\s+[^)]*)?|[^)]*\\s+-(?:literalpath|path)\\s+${powerShellRelativeDirectoryValuePattern}(?:\\s+[^)]*)?)\\s*\\)` +
  `${localOnlyPathResultBoundaryPattern}`;
const powerShellLocationPipelinePropertyPattern =
  `\\$\\(\\s*${powerShellLocationCommandNamePattern}\\s*\\|\\s*(?:(?:select(?:-object)?)\\s+-(?:expandproperty|expand)\\s+|${powerShellPipelinePropertyCommandNamePattern}\\s+)(?:path|providerpath)\\s*\\)` +
  `${localOnlyPathResultBoundaryPattern}`;
const shellLocalOnlyRootCommandSubstitutionPattern =
  `\\$\\(\\s*pwd(?:\\s+-[a-z]+)*\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*git(?:\\s+-C\\s+(?:["']?\\.\\.?["']?|["']?\\.\\.?[/\\\\][^)"'\\s]+["']?))?\\s+rev-parse\\s+--(?:show-toplevel|git-dir|absolute-git-dir|git-common-dir)\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  "`\\s*pwd(?:\\s+-[a-z]+)*\\s*`" +
  `${localOnlyReferenceBoundaryPattern}|` +
  "`\\s*git(?:\\s+-C\\s+(?:[\"']?\\.\\.?[\"']?|[\"']?\\.\\.?[/\\\\][^`\"'\\s]+[\"']?))?\\s+rev-parse\\s+--(?:show-toplevel|git-dir|absolute-git-dir|git-common-dir)\\s*`" +
  `${localOnlyReferenceBoundaryPattern}`;
const shellLocalOnlyScriptReferencePattern =
  `(?:"\\$0"|'\\$0'|\\$0|"\\$\\{bash_source\\[0\\]\\}"|'\\$\\{bash_source\\[0\\]\\}'|\\$\\{bash_source\\[0\\]\\})`;
const shellLocalOnlyScriptDirectoryCommandSubstitutionPattern =
  `\\$\\(\\s*dirname\\s+${shellLocalOnlyScriptReferencePattern}\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*cd\\s+["']?\\$\\(\\s*dirname\\s+${shellLocalOnlyScriptReferencePattern}\\s*\\)["']?\\s*&&\\s*pwd(?:\\s+-[a-z]+)*\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  "`\\s*dirname\\s+" +
  `${shellLocalOnlyScriptReferencePattern}\\s*` +
  "`" +
  `${localOnlyReferenceBoundaryPattern}`;
const shellLocalOnlyCommandSubstitutionPattern =
  `${shellLocalOnlyRootCommandSubstitutionPattern}|` +
  `${shellLocalOnlyScriptDirectoryCommandSubstitutionPattern}|` +
  `\\$\\(\\s*${powerShellLocationCommandNamePattern}\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*${powerShellLocationCommandNamePattern}\\s*\\)\\.(?:path|providerpath)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*${powerShellPathResolutionCommandNamePattern}${powerShellRelativeDirectoryArgumentPattern}\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*${powerShellPathResolutionCommandNamePattern}${powerShellRelativeDirectoryArgumentPattern}\\s*\\)\\.(?:path|providerpath)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*\\(\\s*${powerShellLocationCommandNamePattern}\\s*\\)\\.(?:path|providerpath)\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  `\\$\\(\\s*${powerShellItemCommandNamePattern}${powerShellRelativeDirectoryArgumentPattern}\\s*\\)\\.(?:fullname|pspath)${localOnlyReferenceBoundaryPattern}|` +
  `${powerShellLocationPipelinePropertyPattern}|` +
  `${powerShellJoinPathCurrentDirectoryPattern}`;
const powerShellLocalPathMemberPattern =
  `\\$(?:\\{pwd\\}|pwd)\\.(?:path|providerpath)${localOnlyPathResultBoundaryPattern}|` +
  `\\$(?:\\{myinvocation\\}|myinvocation)\\.mycommand\\.(?:path|definition)${localOnlyPathResultBoundaryPattern}|` +
  `\\$(?:\\{executioncontext\\}|executioncontext)\\.sessionstate\\.path\\.currentlocation${localOnlyPathResultBoundaryPattern}`;
const powerShellLocalProviderPathPattern =
  `(?:env|variable):[/\\\\]?${localOnlyVariableNamePattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellLocalRegistryRootPattern =
  '(?:(?:[a-z0-9_.-]+[/\\\\])?registry::(?:hkey_current_user|hkey_local_machine|hkey_users|hkey_classes_root|hkey_current_config)|' +
  '(?:hkcu|hklm|hku|hkcr|hkcc)):?[/\\\\]';
const powerShellLocalFileSystemRootPattern =
  '(?:[a-z0-9_.-]+[/\\\\])?filesystem::(?:[a-z]:[/\\\\]|/)';
const dotNetLocalOnlyFolderNamePattern =
  '(?:applicationdata|commonapplicationdata|desktop|desktopdirectory|localapplicationdata|mydocuments|personal|' +
  'programfiles(?:x86)?|system(?:x86)?|userprofile|windows)';
const dotNetEnvironmentStaticPrefixPattern = `(?:\\[(?:system\\.)?environment\\]::|(?:system\\.)?environment\\.)`;
const dotNetPathStaticPrefixPattern = `(?:\\[(?:(?:system\\.)?io\\.)?path\\]::|(?:(?:system\\.)?io\\.)?path\\.)`;
const dotNetDirectoryStaticPrefixPattern =
  `(?:\\[(?:(?:system\\.)?io\\.)?directory\\]::|(?:(?:system\\.)?io\\.)?directory\\.)`;
const dotNetFileStaticPrefixPattern = `(?:\\[(?:(?:system\\.)?io\\.)?file\\]::|(?:(?:system\\.)?io\\.)?file\\.)`;
const dotNetAppContextStaticPrefixPattern = `(?:\\[(?:system\\.)?appcontext\\]::|(?:system\\.)?appcontext\\.)`;
const dotNetLocalOnlyPathCallPattern =
  `${dotNetEnvironmentStaticPrefixPattern}getenvironmentvariable\\(\\s*["']${localOnlyVariableNamePattern}["']\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `${dotNetEnvironmentStaticPrefixPattern}getfolderpath\\(\\s*["']${dotNetLocalOnlyFolderNamePattern}["']\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `${dotNetPathStaticPrefixPattern}gettemppath\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `${dotNetDirectoryStaticPrefixPattern}getcurrentdirectory\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `${dotNetEnvironmentStaticPrefixPattern}currentdirectory${localOnlyReferenceBoundaryPattern}|` +
  `${dotNetAppContextStaticPrefixPattern}basedirectory${localOnlyReferenceBoundaryPattern}`;
const quotedLocalOnlyVariableNamePattern = `["']${localOnlyVariableNamePattern}["']`;
const quotedLocalRelativePathPattern = `["'](?:~(?:[/\\\\][^"']*)?|\\.\\.?|\\.\\.?[/\\\\][^"']*)["']`;
const knownLocalEvidenceFileExtensionPattern =
  '(?:adoc|bash|bin|blg|cer|cjs|clixml|cnf|conf|crt|cs|csx|csv|cts|db|der|dll|dump|evtx|hcl|html?|ipynb|jar|jmx|js|json|jsx|jtl|log|lua|markdown|md|mjs|mts|p12|p7b|p7c|pb|pem|pfx|php|pkrvars|pl|prisma|properties|proto|ps1|ps1xml|psc1|psd1|psm1|psrc|pssc|py|qmd|rb|reg|rlib|sarif|sh|sha256|spc|sqlite3?|sql|sst|tfplan|tfvars|toml|ts|tsx|txt|vb|wasm|xml|ya?ml|zip|zsh)';
const shellKnownNamespaceNameTextPattern =
  '(?:microsoft\\.[a-z0-9_.]+|system\\.[a-z0-9_.]+|(?:com|io|java|net|org|scala)\\.[a-z0-9_.]+)';
const quotedKnownNamespaceNameLiteralPattern =
  `(?!(?:[a-z0-9_.]+\\.${knownLocalEvidenceFileExtensionPattern})(?=["'\\x60]))` +
  `${shellKnownNamespaceNameTextPattern}(?=["'\\x60])`;
const bracedKnownNamespaceNameLiteralPattern =
  `(?!(?:[a-z0-9_.]+\\.${knownLocalEvidenceFileExtensionPattern})(?=\\}))` +
  `${shellKnownNamespaceNameTextPattern}(?=\\})`;
const localPathLikeLiteralContentPattern =
  `(?!${quotedKnownNamespaceNameLiteralPattern})(?:~(?:[/\\\\][^"'\\x60]*)?|\\.\\.?|\\.\\.?[/\\\\][^"'\\x60]*|` +
  `[^"'/:\\\\\\x60][^"'/:\\\\\\x60]*(?:(?:[/\\\\][^"':\\x60]+)|\\.[a-z0-9][a-z0-9_-]*))`;
const bracedLocalPathLikeLiteralContentPattern =
  `(?!${bracedKnownNamespaceNameLiteralPattern})(?:~(?:[/\\\\][^}]*)?|\\.\\.?|\\.\\.?[/\\\\][^}]*|` +
  `(?:[<>])?[^}'/:\\\\][^}'/:\\\\]*(?:(?:[/\\\\][^}':]+)|\\.[a-z0-9][a-z0-9_-]*))`;
const quotedLocalPathLikePattern =
  `(?:[rubf]{0,3}["']${localPathLikeLiteralContentPattern}["']|` +
  `(?:string\\.raw)?\\x60${localPathLikeLiteralContentPattern}\\x60|` +
  `(?:q|qq|%q)\\{${bracedLocalPathLikeLiteralContentPattern}\\})`;
const explicitLocalPathLikeLiteralContentPattern =
  `(?!${quotedKnownNamespaceNameLiteralPattern})(?:~(?:[/\\\\][^"'\\x60]*)?|\\.\\.?|\\.\\.?[/\\\\][^"'\\x60]*|` +
  `[^"'/:\\\\\\x60][^"'/:\\\\\\x60]*\\.[a-z0-9][a-z0-9_-]*)`;
const bracedExplicitLocalPathLikeLiteralContentPattern =
  `(?!${bracedKnownNamespaceNameLiteralPattern})(?:~(?:[/\\\\][^}]*)?|\\.\\.?|\\.\\.?[/\\\\][^}]*|` +
  `(?:[<>])?[^}'/:\\\\][^}'/:\\\\]*\\.[a-z0-9][a-z0-9_-]*)`;
const quotedExplicitLocalPathLikePattern =
  `(?:[rubf]{0,3}["']${explicitLocalPathLikeLiteralContentPattern}["']|` +
  `(?:string\\.raw)?\\x60${explicitLocalPathLikeLiteralContentPattern}\\x60|` +
  `(?:q|qq|%q)\\{${bracedExplicitLocalPathLikeLiteralContentPattern}\\})`;
const unquotedLocalPathLikePattern =
  `[^\\s)"'\\],;/:\\\\|&<>\\x60][^\\s)"'\\],;/:\\\\|&<>\\x60]*(?:(?:[/\\\\][^\\s)"'\\],;:|&<>\\x60]+)|\\.[a-z0-9][a-z0-9_-]*)`;
const shellLocalOnlyParameterExpansionAdjacentPathPattern =
  `\\$\\{(?:env:)?${localOnlyVariableNamePattern}\\}${unquotedLocalPathLikePattern}${localOnlyReferenceBoundaryPattern}`;
const shellLocalOnlyCommandSubstitutionAdjacentPathPattern =
  `(?:\\$\\(\\s*pwd(?:\\s+-[a-z]+)*\\s*\\)|` +
  `\\$\\(\\s*git(?:\\s+-C\\s+(?:["']?\\.\\.?["']?|["']?\\.\\.?[/\\\\][^)"'\\s]+["']?))?\\s+rev-parse\\s+--(?:show-toplevel|git-dir|absolute-git-dir|git-common-dir)\\s*\\)|` +
  `\\x60\\s*pwd(?:\\s+-[a-z]+)*\\s*\\x60|` +
  `\\x60\\s*git(?:\\s+-C\\s+(?:["']?\\.\\.?["']?|["']?\\.\\.?[/\\\\][^\\x60"'\\s]+["']?))?\\s+rev-parse\\s+--(?:show-toplevel|git-dir|absolute-git-dir|git-common-dir)\\s*\\x60|` +
  `\\$\\(\\s*dirname\\s+${shellLocalOnlyScriptReferencePattern}\\s*\\)|` +
  `\\x60\\s*dirname\\s+${shellLocalOnlyScriptReferencePattern}\\s*\\x60|` +
  `\\$\\(\\s*${powerShellLocationCommandNamePattern}\\s*\\))${unquotedLocalPathLikePattern}${localOnlyReferenceBoundaryPattern}`;
const windowsEnvironmentVariableReferencePattern = `%${localOnlyVariableNamePattern}%|!${localOnlyVariableNamePattern}!`;
const windowsEnvironmentAdjacentPathPattern =
  `(?:${windowsEnvironmentVariableReferencePattern})${unquotedLocalPathLikePattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellEnvironmentAdjacentPathPattern =
  `\\$env:${localOnlyVariableNamePattern}${adjacentLocalPathLikeSuffixPattern}`;
const commandLocalRelativePathPattern =
  `(?:${quotedLocalPathLikePattern}|~(?:[/\\\\][^\\s)"'\\],;|&<>]+)?|\\.\\.?|\\.\\.?[/\\\\][^\\s)"'\\],;|&<>]+|` +
  `${unquotedLocalPathLikePattern})`;
const commandExplicitLocalPathPattern =
  `(?:${quotedExplicitLocalPathLikePattern}|~(?:[/\\\\][^\\s)"'\\],;|&<>]+)?|\\.\\.?|\\.\\.?[/\\\\][^\\s)"'\\],;|&<>]+|` +
  `[^\\s)"'\\],;/:\\\\|&<>][^\\s)"'\\],;/:\\\\|&<>]*\\.[a-z0-9][a-z0-9_-]*)`;
const commandRelativeOrHomeLocalPathPattern =
  `(?:~(?:[/\\\\][^\\s)"'\\],;|&<>]+)?|\\.\\.?|\\.\\.?[/\\\\][^\\s)"'\\],;|&<>]+|` +
  `["'](?:~(?:[/\\\\][^"']*)?|\\.\\.?|\\.\\.?[/\\\\][^"']*)["'])`;
const commandDirectoryLocalPathPattern =
  `(?:${commandRelativeOrHomeLocalPathPattern}|` +
  `["'][^"':\\\\]*[/\\\\][^"']*["']|` +
  `[^\\s)"'\\],;/:\\\\|&<>][^\\s)"'\\],;:|&<>]*[/\\\\][^\\s)"'\\],;|&<>]+)`;
const driveRelativeLocalPathPattern = `[a-z]:${unquotedLocalPathLikePattern}`;
const powerShellFileSystemDriveRelativePathPattern =
  `(?:[a-z0-9_.-]+[/\\\\])?filesystem::${driveRelativeLocalPathPattern}`;
const driveRelativeEvidenceTargetValuePattern =
  `(?:(?:file:)?${driveRelativeLocalPathPattern}|${powerShellFileSystemDriveRelativePathPattern})`;
const shellKnownNamespaceNameArgumentPattern =
  `(?!(?:[a-z0-9_.]+\\.${knownLocalEvidenceFileExtensionPattern})${localOnlyReferenceBoundaryPattern})` +
  `${shellKnownNamespaceNameTextPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellKnownNamespaceNameVolumeSourcePattern =
  `(?!(?:[a-z0-9_.]+\\.${knownLocalEvidenceFileExtensionPattern})(?::|${localOnlyReferenceBoundaryPattern}))` +
  `${shellKnownNamespaceNameTextPattern}(?::|${localOnlyReferenceBoundaryPattern})`;
const shellKnownNamespaceNameHashtableValuePattern =
  `(?!(?:[a-z0-9_.]+\\.${knownLocalEvidenceFileExtensionPattern})\\s*[;}])` +
  `${shellKnownNamespaceNameTextPattern}\\s*[;}]`;
const commandLocalRelativeNonNamespacePathPattern =
  `(?!${shellKnownNamespaceNameArgumentPattern})${commandLocalRelativePathPattern}`;
const commandLocalRelativeNonNamespaceVolumeSourcePathPattern =
  `(?!${shellKnownNamespaceNameVolumeSourcePattern})${commandLocalRelativePathPattern}`;
const commandLocalRelativeNonOptionNonNamespacePathPattern =
  `(?!(?:--?|/)[a-z0-9][a-z0-9_.-]*(?:=|:))${commandLocalRelativeNonNamespacePathPattern}`;
const commandLocalRelativePathOptionPattern =
  `(?:--?[a-z0-9][a-z0-9_.-]*|/[a-z0-9][a-z0-9_.-]*|-[a-z0-9][a-z0-9_.-]*)(?:=|:)${commandLocalRelativeNonNamespacePathPattern}`;
const fileUriEnvironmentLocalPathValuePattern =
  `file:(?:\\$env:${localOnlyVariableNamePattern}|\\$\\{(?:env:)?${localOnlyVariableNamePattern}\\}|${windowsEnvironmentVariableReferencePattern})(?:[/\\\\][^\\s)"'\\],;|&<>]*)?`;
const relativeFileUriLocalPathValuePattern = `file:${commandLocalRelativeNonNamespacePathPattern}`;
const shellCdPwdCommandSubstitutionPattern =
  `\\$\\(\\s*cd\\s+${commandLocalRelativeNonNamespacePathPattern}\\s+&&\\s+pwd(?:\\s+-[a-z]+)*\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  "`\\s*cd\\s+" +
  `${commandLocalRelativeNonNamespacePathPattern}\\s+&&\\s+pwd(?:\\s+-[a-z]+)*\\s*` +
  "`" +
  `${localOnlyPathResultBoundaryPattern}`;
const shellCommandArgumentPattern =
  `(?:[^\\s)"'\\],;|&<>]*"[^"]*"[^\\s)"'\\],;|&<>]*|[^\\s)"'\\],;|&<>]*'[^']*'[^\\s)"'\\],;|&<>]*|[^\\s)"'\\],;|&<>]+)`;
const shellDescriptorMergeRedirectionPattern = `\\d*>\\s*&\\s*\\d+`;
const shellCommandSkippableTokenPattern =
  `(?:${shellDescriptorMergeRedirectionPattern}|${shellCommandArgumentPattern}|\\d*<<<?[^\\s)"'\\],;|&<>]*|\\d*<|\\d*>>?|&>|\\|\\|?|&&|;)`;
const shellInlineCodeOptionWithArgumentPattern =
  `(?:-(?:c|e|ne|pe)|--(?:command|eval|execute))\\s+${shellCommandArgumentPattern}`;
const shellFileCommandPlainSkippableTokenPattern =
  `(?!(?:-(?:c|e|ne|pe)|--(?:command|eval|execute))${localOnlyReferenceBoundaryPattern})` +
  `${shellCommandSkippableTokenPattern}`;
const shellFileCommandSkippableTokenPattern =
  `(?:${shellInlineCodeOptionWithArgumentPattern}|${shellFileCommandPlainSkippableTokenPattern})`;
const shellRedirectionOperatorPattern = '(?:\\d*>>?|\\d*<|<>|&>)';
const scriptRunnerPathExtensionPattern = '(?:bash|cjs|cts|dll|jar|js|jsx|mjs|mts|php|pl|ps1|py|rb|sh|ts|tsx|zsh)';
const scriptRunnerLocalPathPattern =
  `(?:["'][^"':]+\\.${scriptRunnerPathExtensionPattern}["']|[^\\s)"'\\],;:|&<>]+\\.${scriptRunnerPathExtensionPattern})`;
const shellScriptRunnerCommandNamePattern =
  '(?:bash|bun|deno|dotnet|java|node|npx|perl|php|powershell|pwsh|py|python|python3|ruby|sh|ts-node|tsx|zsh)';
const shellScriptRunnerInlineBareRedirectionPattern =
  `${shellScriptRunnerCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+(?:-[a-z]*c[a-z]*|--command)\\s+["'][^"']*` +
  `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellScriptRunnerPathArgumentPattern =
  `${shellScriptRunnerCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+${scriptRunnerLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const gitObjectPathArgumentPattern =
  `git(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+(?:[a-z0-9._/-]+|[a-f0-9]{7,40}):${unquotedLocalPathLikePattern}${localOnlyReferenceBoundaryPattern}`;
const shellGitBundleCreateLocalPathPattern =
  `git(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+bundle\\s+create` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+${commandExplicitLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellGitCloneLocalPathPattern =
  `git(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+clone(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${shellCommandArgumentPattern}\\s+${commandExplicitLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellGitWorktreeAddLocalPathPattern =
  `git(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+worktree\\s+add` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+${commandExplicitLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellGitPatchInputLocalPathPattern =
  `git(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+(?:am|apply)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+${commandExplicitLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellFileCommandNamePattern =
  '(?:7z|attrib|auditpol|awk|az|bat|b2sum|bcdedit|bitsadmin|bun|cat|certutil|cipher|cksum|cmp|comp|compact|control|copy|cp|cscript|curl|cut|del|deno|' +
  'diff|dir|dism|driverquery|du|echo|erase|esentutl|expand|extrac32|fd|file|find|findstr|fsutil|gh|gpg|gpresult|grep|head|hexdump|jq|less|lodctr|logman|ls|makecab|md5|' +
  'fc|icacls|installutil|md|md5sum|mkdir|more|move|mshta|msiexec|mv|netsh|nl|node|od|openssl|perl|pnputil|presentationhost|py|python|python3|readlink|realpath|regsvr32|relog|rg|rundll32|secedit|signtool|' +
  'printf|rd|ripgrep|rm|rmdir|robocopy|rsync|ruby|scp|sed|sftp|sha1sum|sha224sum|sha256sum|sha384sum|sha512sum|' +
  'shasum|sort|sqlite-utils|sqlite3|stat|systeminfo|tail|takeown|tar|tee|touch|tracerpt|type|typeperf|uniq|unzip|vssadmin|wbadmin|wc|wevtutil|where(?:\\.exe)?|wget|wmic|wscript|xargs|xcopy|xxd|yq|zip|' +
  'mapfile|read|' +
  'forfiles|ren)';
const shellFileCommandInvocationPattern = `${shellFileCommandNamePattern}(?:\\.exe)?(?=\\s|[<>])`;
const shellFileScriptRunnerCommandNamePattern = '(?:bun|deno|node|perl|php|py|python|python3|ruby)';
const shellNonScriptFileCommandInvocationPattern =
  `(?!${shellFileScriptRunnerCommandNamePattern}(?:\\.exe)?(?=\\s|[<>]))${shellFileCommandInvocationPattern}`;
const shellGitToolLocalPathOptionPattern =
  `git(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `(?:(?:-(?:C|o))\\s*|--(?:git[-_]?dir|output|output[-_]?directory|prefix|reference(?:[-_]?if[-_]?able)?|` +
  `separate[-_]?git[-_]?dir|work[-_]?tree)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellScriptRunnerFileCommandPathArgumentPattern =
  `${shellFileScriptRunnerCommandNamePattern}(?:\\.exe)?(?=\\s|[<>])(?:\\s+${shellFileCommandSkippableTokenPattern}){0,8}\\s+` +
  `(?:${commandLocalRelativeNonOptionNonNamespacePathPattern}|${commandLocalRelativePathOptionPattern})${localOnlyReferenceBoundaryPattern}`;
const shellNonScriptFileCommandPathArgumentPattern =
  `${shellNonScriptFileCommandInvocationPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `(?:${commandLocalRelativeNonOptionNonNamespacePathPattern}|${commandLocalRelativePathOptionPattern})${localOnlyReferenceBoundaryPattern}`;
const shellFileCommandPathArgumentPattern =
  `(?:${shellScriptRunnerFileCommandPathArgumentPattern}|${shellNonScriptFileCommandPathArgumentPattern})`;
const powerShellStartProcessCommandNamePattern = '(?:start-process|saps|start)';
const shellProcessWorkingDirectoryArgumentPattern =
  `${powerShellStartProcessCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+-(?:workingdirectory|workingdir)\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellPathOptionValueSeparatorPattern = `(?:\\s+|[=:]\\s*)`;
const powerShellStartProcessFilePathArgumentPattern =
  `${powerShellStartProcessCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-filepath${powerShellPathOptionValueSeparatorPattern}${commandDirectoryLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellStartProcessRedirectLocalPathArgumentPattern =
  `${powerShellStartProcessCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-redirectstandard(?:error|input|output)${powerShellPathOptionValueSeparatorPattern}` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellSelectXmlPathArgumentPattern =
  `select-xml(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+-(?:literalpath|path)\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellWebOutputLocalPathPattern =
  `(?:invoke-restmethod|invoke-webrequest|irm|iwr)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-(?:infile|outfile)${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellBitsTransferLocalPathPattern =
  `start-bitstransfer(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-(?:destination|source)${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellSaveCommandLocalPathPattern =
  `(?:save-help|save-module|save-package|save-script)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-(?:destinationpath|literalpath|path)${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellAddTypeLocalFilePattern =
  `(?:"[^"':]+\\.(?:cs|csx|dll|vb)"|'[^"':]+\\.(?:cs|csx|dll|vb)'|` +
  `[^\\s)"'\\],;:|&<>]+\\.(?:cs|csx|dll|vb))`;
const powerShellAddTypeLocalPathPattern =
  `add-type(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:literalpath|outputassembly|path|referencedassemblies)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellAddTypeLocalFilePattern})${localOnlyReferenceBoundaryPattern}`;
const powerShellKnownLocalFilePathPattern =
  `(?:"[^"':]+\\.${knownLocalEvidenceFileExtensionPattern}"|` +
  `'[^"':]+\\.${knownLocalEvidenceFileExtensionPattern}'|` +
  `[^\\s)"'\\],;:|&<>]+\\.${knownLocalEvidenceFileExtensionPattern})`;
const powerShellRelativeOrKnownLocalFilePathPattern =
  `(?:${commandRelativeOrHomeLocalPathPattern}|${powerShellKnownLocalFilePathPattern})`;
const powerShellStartProcessPositionalLocalPathPattern =
  `${powerShellStartProcessCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellContentFileLocalPathPattern =
  `(?:add-content|ac|clear-content|clc|format-hex|fhx|get-content|gc|get-filehash|out-file|select-string|sls|set-content|sc)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:filepath|literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellTeeObjectLocalPathPattern =
  `tee-object(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:filepath|literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellItemLocalPathPattern =
  `(?:clear-item|cli|convert-path|get-acl|get-childitem|gci|get-item|gi|invoke-item|ii|remove-item|ri|resolve-path|rp|set-acl|test-path|unblock-file)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellItemMutationLocalPathPattern =
  `(?:copy-item|cpi|move-item|mi|new-item|ni|rename-item|rni|set-item|si)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:destination|literalpath|path|target|value)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellItemPropertyLocalPathPattern =
  `(?:clear-itemproperty|clp|copy-itemproperty|cpp|get-itemproperty|gp|get-itempropertyvalue|gpv|move-itemproperty|mp|` +
  `new-itemproperty|remove-itemproperty|rnp|rename-itemproperty|set-itemproperty|sp)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellArchiveLocalPathPattern =
  `(?:compress-archive|expand-archive)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:destinationpath|literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellPSDriveLocalPathPattern =
  `(?:new-psdrive|ndr)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-root${powerShellPathOptionValueSeparatorPattern}${commandDirectoryLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellLocalizedDataLocalPathPattern =
  `import-localizeddata(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-(?:basedirectory|filename|literalpath|path)${powerShellPathOptionValueSeparatorPattern}` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellFormatTypeDataLocalPathPattern =
  `(?:export-formatdata|update-formatdata|update-typedata)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-(?:appendpath|path|prependpath)${powerShellPathOptionValueSeparatorPattern}` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellSerializedDataLocalPathPattern =
  `(?:export-alias|export-clixml|export-csv|epal|epcsv|import-alias|import-clixml|import-csv|ipal|ipcsv)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellCommandDiscoveryLocalPathArgumentPattern =
  `(?:${powerShellRelativeOrKnownLocalFilePathPattern}|` +
  `-(?:module|name)${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern})`;
const powerShellHelpLocalPathArgumentPattern =
  `(?:${powerShellRelativeOrKnownLocalFilePathPattern}|` +
  `-(?:literalpath|name|path)${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern})`;
const powerShellCommandDiscoveryLocalPathPattern =
  `(?:get-command|gcm)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${powerShellCommandDiscoveryLocalPathArgumentPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellHelpLocalPathPattern =
  `(?:get-help|help|man)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${powerShellHelpLocalPathArgumentPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellWinEventLocalPathPattern =
  `get-winevent\\s+${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}|` +
  `get-winevent(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `-path${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellCounterLocalPathPattern =
  `get-counter(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `-path${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellCounterDataLocalPathPattern =
  `(?:export-counter|import-counter)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-path${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellCertificateLocalPathPattern =
  `(?:export-certificate|import-certificate|export-pfxcertificate|import-pfxcertificate|get-authenticodesignature|get-pfxcertificate|set-authenticodesignature)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:filepath|literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellJobInvocationLocalPathPattern =
  `(?:invoke-command|icm|start-job|sajb|start-threadjob)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-filepath${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellModuleCommandLocalPathPattern =
  `(?:import-module|ipmo)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `(?:-(?:assembly|fullyqualifiedname|name)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellPSSessionModuleOutputLocalPathPattern =
  `(?:export-pssession|import-pssession|epsn|ipsn)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-outputmodule${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellModuleManifestLocalPathPattern =
  `(?:new-modulemanifest|update-modulemanifest)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-path${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}|` +
  `-(?:filelist|modulelist|nestedmodules|requiredmodules|rootmodule)${powerShellPathOptionValueSeparatorPattern}` +
  `${powerShellRelativeOrKnownLocalFilePathPattern})${localOnlyReferenceBoundaryPattern}`;
const powerShellModuleManifestTestLocalPathPattern =
  `test-modulemanifest(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `(?:-(?:literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellDataFileLocalPathPattern =
  `import-powershelldatafile(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `(?:-(?:literalpath|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellModulePublishLocalPathPattern =
  `(?:publish-module|publish-script)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-path${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellExportConsoleLocalPathPattern =
  `export-console(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `-path${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellTranscriptLocalPathPattern =
  `start-transcript(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:literalpath|outputdirectory|path)${powerShellPathOptionValueSeparatorPattern})?` +
  `${powerShellRelativeOrKnownLocalFilePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellSessionConfigurationLocalPathPattern =
  `(?:new-pssessionconfigurationfile|npssc)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:path|transcriptdirectory)${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}|` +
  `-modulestoimport${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern})${localOnlyReferenceBoundaryPattern}|` +
  `(?:register-pssessionconfiguration|set-pssessionconfiguration)(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:-(?:path|startupscript)${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}|` +
  `-(?:assemblyname|modulestoimport)${powerShellPathOptionValueSeparatorPattern}${powerShellRelativeOrKnownLocalFilePathPattern})${localOnlyReferenceBoundaryPattern}`;
const powerShellPathParameterCommandLocalPathPattern =
  `(?:convertfrom-string|new-psrolecapabilityfile|remove-typedata|set-tracesource|test-pssessionconfigurationfile|trace-command|update-help)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `-(?:filepath|path|sourcepath|templatefile)${powerShellPathOptionValueSeparatorPattern}${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellObjectOutputCommandNamePattern =
  `(?:compare(?:-object)?|convert(?:from|to)-(?:csv|html|json|xml)|f(?:c|l|t|w)|format-(?:custom|list|table|wide)|` +
  `foreach(?:-object)?|%|group(?:-object)?|measure(?:-object)?|out-string|select(?:-object)?|sort(?:-object)?|` +
  `where(?:-object)?|\\?|write-(?:debug|error|host|information|output|progress|verbose|warning))`;
const powerShellObjectOutputCommandRedirectionPattern =
  `${powerShellObjectOutputCommandNamePattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellFileCommandRedirectionPattern =
  `${shellFileCommandInvocationPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+${shellRedirectionOperatorPattern}\\s*` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellFileCommandAdjacentRedirectionPattern =
  `${shellFileCommandInvocationPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s*${shellRedirectionOperatorPattern}\\s*` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellControlRedirectionPattern =
  `(?:done|fi|\\})(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+${shellRedirectionOperatorPattern}\\s*` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellBuiltinRedirectionPattern =
  `(?:exec|true|false|:)(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s*${shellRedirectionOperatorPattern}\\s*` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const windowsForCommandLocalPathPattern =
  `for(?:\\s+/[a-z0-9]+)*\\s+%{1,2}[a-z0-9]\\s+in\\s+\\(\\s*${commandLocalRelativeNonNamespacePathPattern}\\s*\\)\\s+do\\s+`;
const windowsRegistryImportLocalPathPattern =
  `(?:reg(?:\\.exe)?\\s+import|regedit(?:\\.exe)?(?:\\s+/s)?)(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const windowsCertificateRequestLocalPathPattern =
  `certreq(?:\\.exe)?(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+${commandExplicitLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const windowsScheduledTaskXmlLocalPathPattern =
  `schtasks(?:\\.exe)?(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+/xml\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const windowsInventoryCommandRedirectionPattern =
  `(?:driverquery|systeminfo|tasklist)(?:\\.exe)?(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+${shellRedirectionOperatorPattern}\\s*` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellHashtableLocalPathAssignmentPattern =
  `@\\{[^}]*\\b(?:path|literalpath|file|filename)\\s*=\\s*(?!${shellKnownNamespaceNameHashtableValuePattern})` +
  `${commandLocalRelativeNonNamespacePathPattern}(?:\\s*[;}]|\\s*\\})`;
const shellSourceCommandPathArgumentPattern =
  `source\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellDotSourceLocalPathPattern = `\\.\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellPowerShellCallOperatorLocalPathPattern = `&\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const quotedLocalVariableReferencePattern =
  `["'](?:\\$\\{?(?:env:)?${localOnlyVariableNamePattern}\\}?|%${localOnlyVariableNamePattern}%|!${localOnlyVariableNamePattern}!)(?:[/\\\\][^"']*)?["']`;
const localOnlyRuntimePropertyNamePattern = '(?:user\\.home|user\\.dir|java\\.io\\.tmpdir)';
const dotNetPathConstructorPattern =
  `${dotNetPathStaticPrefixPattern}(?:combine|join)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const dotNetFileSystemPathArgumentPattern =
  `${dotNetFileStaticPrefixPattern}(?:appendalllines|appendalltext|appendtext|copy|create|createtext|delete|exists|open|openread|openwrite|readallbytes|readalllines|readalltext|readlines|move|replace|writeallbytes|writealllines|writealltext)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `${dotNetDirectoryStaticPrefixPattern}(?:createdirectory|delete|enumeratedirectories|enumeratefiles|enumeratefilesystementries|exists|getdirectories|getfiles|getfilesystementries|getparent|move)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `new\\s+(?:(?:system\\.)?io\\.)?(?:directoryinfo|fileinfo|filestream|streamreader|streamwriter)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const dotNetProcessStaticPrefixPattern =
  `(?:\\[(?:system\\.)?diagnostics\\.process\\]::|(?:(?:system\\.)?diagnostics\\.)?process\\.)`;
const dotNetProcessRunnerPathArgumentPattern =
  `(?:${dotNetProcessStaticPrefixPattern}start|new\\s+(?:(?:system\\.)?diagnostics\\.)?processstartinfo)\\(\\s*["'][^"']+["']\\s*,\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const dotNetProcessRunnerWorkingDirectoryPattern =
  `new\\s+(?:(?:system\\.)?diagnostics\\.)?processstartinfo(?:\\([^)]*\\))?\\s*\\{[^}]*\\bworkingdirectory\\s*=\\s*${quotedLocalPathLikePattern}[^}]*\\}${localOnlyPathResultBoundaryPattern}`;
const dotNetProcessRunnerWorkingDirectoryAssignmentPattern =
  `\\b[a-z_][a-z0-9_]*(?:\\.[a-z_][a-z0-9_]*)*\\.workingdirectory\\s*=\\s*${quotedLocalPathLikePattern}${localOnlyPathResultBoundaryPattern}`;
const javascriptFsModulePathAccessorPattern =
  `(?:(?:fs|require\\(\\s*["'](?:node:)?fs["']\\s*\\))\\.promises|fs|fsp|fspromises|require\\(\\s*["'](?:node:)?fs(?:/promises)?["']\\s*\\))`;
const javascriptBareFileApiNamePattern =
  '(?:access(?:sync)?|appendfile(?:sync)?|copyfile(?:sync)?|cp(?:sync)?|createreadstream|createwritestream|' +
  'existsync|lstat(?:sync)?|mkdir(?:sync)?|mkdtemp(?:sync)?|opendir(?:sync)?|readfile(?:sync)?|' +
  'readdir(?:sync)?|realpath(?:sync)?|rename(?:sync)?|rm(?:sync)?|rmdir(?:sync)?|stat(?:sync)?|' +
  'truncate(?:sync)?|unlink(?:sync)?|watch(?:file)?|writefile(?:sync)?)';
const javascriptProcessRunnerPathArgumentPattern =
  `(?:(?:child_process\\.)?(?:execfile|execfilesync|spawn|spawnsync)|execa(?:sync)?)\\(\\s*["'][^"']+["']\\s*,\\s*\\[[^\\]]*${quotedLocalPathLikePattern}[^\\]]*\\](?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const javascriptRuntimeProcessRunnerPathArgumentPattern =
  `(?:bun\\.(?:spawn|spawnsync)\\(\\s*\\[[^\\]]*${quotedLocalPathLikePattern}[^\\]]*\\](?:\\s*,[^)]*)?\\)|` +
  `(?:new\\s+)?deno\\.command\\(\\s*["'][^"']+["']\\s*,\\s*\\{[^}]*\\bargs\\s*:\\s*\\[[^\\]]*${quotedLocalPathLikePattern}[^\\]]*\\][^}]*\\}\\s*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*)${localOnlyPathResultBoundaryPattern}`;
const javascriptProcessRunnerWorkingDirectoryPattern =
  `(?:(?:child_process\\.)?(?:exec|execsync|execfile|execfilesync|spawn|spawnsync)|execa(?:sync)?|(?:new\\s+)?deno\\.command|bun\\.(?:spawn|spawnsync))\\([^)]*\\{[^}]*\\bcwd\\s*:\\s*${quotedLocalPathLikePattern}[^}]*\\}[^)]*\\)${localOnlyPathResultBoundaryPattern}`;
const javascriptProcessRunnerWorkingDirectoryOptionPattern =
  `\\bcwd\\s*:\\s*${quotedLocalPathLikePattern}${localOnlyPathResultBoundaryPattern}`;
const javascriptFileApiPathArgumentPattern =
  `${javascriptFsModulePathAccessorPattern}\\.(?:access|accesssync|appendfile|appendfilesync|copyfile|copyfilesync|cp|cpsync|createreadstream|createwritestream|existsync|lstat|lstatsync|mkdir|mkdirsync|mkdtemp|mkdtempsync|open|opensync|opendir|opendirsync|readfile|readfilesync|readdir|readdirsync|realpath|realpathsync|rename|renamesync|rm|rmsync|rmdir|rmdirsync|stat|statsync|truncate|truncatesync|unlink|unlinksync|watch|watchfile|writefile|writefilesync)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `${javascriptBareFileApiNamePattern}\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `${javascriptProcessRunnerPathArgumentPattern}|` +
  `${javascriptRuntimeProcessRunnerPathArgumentPattern}|` +
  `${javascriptProcessRunnerWorkingDirectoryPattern}|` +
  `${javascriptProcessRunnerWorkingDirectoryOptionPattern}|` +
  `(?:deno\\.(?:chmod|chown|copyfile|lstat|maketempdir|maketempfile|mkdir|open|readfile|readtextfile|readdir|readlink|realpath|remove|rename|stat|symlink|watchfs|writefile|writetextfile)|bun\\.(?:file|write))\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `new\\s+url\\(\\s*${quotedLocalPathLikePattern}\\s*,\\s*import\\.meta\\.url\\s*\\)${localOnlyPathResultBoundaryPattern}`;
const javaPathConstructorPattern =
  `(?:java\\.nio\\.file\\.)?(?:paths\\.get|path\\.of)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `new\\s+(?:java\\.io\\.)?file\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const jvmFileSystemPathArgumentPattern =
  `new\\s+(?:java\\.io\\.)?(?:fileinputstream|fileoutputstream|filereader|filewriter|randomaccessfile)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:java\\.io\\.)?file\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}|` +
  `(?:java\\.nio\\.file\\.)?files\\.(?:copy|createfile|createdirectory|createdirectories|delete|deleteifexists|exists|find|getlastmodifiedtime|ishidden|isdirectory|isregularfile|list|mismatch|move|newbufferedreader|newbufferedwriter|newinputstream|newoutputstream|probecontenttype|readallbytes|readalllines|readstring|size|walk|write|writestring)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:scala\\.io\\.)?source\\.fromfile\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:kotlin\\.io\\.path\\.path\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)|path\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))+)(?:${localOnlyPathResultBoundaryPattern})`;
const jvmProcessRunnerPathArgumentPattern =
  `new\\s+(?:java\\.lang\\.)?processbuilder\\(\\s*["'][^"']+["']\\s*,\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}|` +
  `(?:java\\.lang\\.)?runtime\\.getruntime\\(\\)\\.exec\\(\\s*new\\s+string\\[\\]\\s*\\{[^}]*${quotedLocalPathLikePattern}[^}]*\\}\\s*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}`;
const absolutePathHelperPattern =
  `(?:java\\.nio\\.file\\.)?(?:paths\\.get|path\\.of)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)\\.(?:toabsolutepath|torealpath)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `new\\s+(?:java\\.io\\.)?file\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)\\.(?:getabsolutepath|getcanonicalpath)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:std::)?fs::canonicalize\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `filepath\\.abs\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}`;
const goFileSystemPathArgumentPattern =
  `os\\.(?:chmod|chown|create|lstat|mkdir|mkdirall|open|openfile|readfile|readlink|remove|removeall|rename|stat|symlink|truncate|writefile)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:io/)?ioutil\\.(?:readfile|tempdir|tempfile|writefile)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:path/)?filepath\\.(?:abs|clean|evalsymlinks|glob|join|walk|walkdir)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const goProcessRunnerPathArgumentPattern =
  `(?:os/)?exec\\.command\\(\\s*["'][^"']+["']\\s*,\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const goProcessRunnerWorkingDirectoryAssignmentPattern =
  `\\b[a-z_][a-z0-9_]*\\.dir\\s*=\\s*${quotedLocalPathLikePattern}${localOnlyPathResultBoundaryPattern}`;
const rustFileSystemPathArgumentPattern =
  `(?:(?:std::)?fs::(?:copy|create_dir|create_dir_all|hard_link|metadata|read|read_dir|read_to_string|remove_dir|remove_dir_all|remove_file|rename|set_permissions|symlink_metadata|write)|` +
  `(?:(?:std::)?fs::)?file::(?:create|open))\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:(?:std::)?fs::)?openoptions::new\\(\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*\\.open\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:(?:std::path::)?(?:path|pathbuf)::(?:new|from))\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}`;
const rustProcessRunnerPathArgumentPattern =
  `(?:std::process::)?command::new\\(\\s*["'][^"']+["']\\s*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*` +
  `\\.(?:arg|args)\\(\\s*(?:${quotedLocalPathLikePattern}|\\[[^\\]]*${quotedLocalPathLikePattern}[^\\]]*\\])\\s*\\)` +
  `(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}`;
const rustProcessRunnerWorkingDirectoryPattern =
  `(?:std::process::)?command::new\\(\\s*["'][^"']+["']\\s*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*` +
  `\\.current_dir\\(\\s*${quotedLocalPathLikePattern}\\s*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}|` +
  `\\b[a-z_][a-z0-9_]*\\.current_dir\\(\\s*${quotedLocalPathLikePattern}\\s*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}`;
const cQuotedLocalPathLikePattern =
  `(?:(?:l|u8?)?${quotedLocalPathLikePattern}|(?:_?t|text)\\(\\s*${quotedLocalPathLikePattern}\\s*\\))`;
const cFileSystemPathArgumentPattern =
  `(?:_?w?(?:access|chmod|chown|lchown|lstat|opendir|readlink|stat|truncate|utime|utimes)|_?w?fopen|_?tfopen)\\(\\s*${cQuotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:createfile|deletefile|getfileattributes|copyfile(?:ex)?|movefile(?:ex)?|createdirectory|removedirectory)[aw]?\\(\\s*${cQuotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const cppFileSystemPathArgumentPattern =
  `(?:(?:std::)?(?:w?ifstream|w?ofstream|w?fstream|basic_ifstream|basic_ofstream|basic_fstream)|(?:qfile|qfileinfo|qdir|qsavefile))\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:(?:std::|boost::)?filesystem::(?:absolute|canonical|copy|copy_file|create_director(?:y|ies)|directory_iterator|exists|file_size|is_directory|is_regular_file|last_write_time|path|recursive_directory_iterator|remove|remove_all|rename|status|weakly_canonical)|qfile::(?:copy|exists|remove|rename|resize|setpermissions))\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:std::)?(?:freopen|remove)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:fopen_s|freopen_s)\\(\\s*&?[a-z_][a-z0-9_]*\\s*,\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const scriptingFileApiCallChainPattern = `(?:(?:\\.|->)[a-z_][a-z0-9_!?]*(?:\\([^)]*\\))?)*`;
const pythonSubprocessRunnerPathArgumentPattern =
  `subprocess\\.(?:run|popen|call|check_call|check_output)\\(\\s*[\\[(][^\\]\\)]*${quotedLocalPathLikePattern}[^\\]\\)]*[\\])](?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}`;
const pythonSubprocessRunnerWorkingDirectoryPattern =
  `subprocess\\.(?:run|popen|call|check_call|check_output)\\([^)]*\\bcwd\\s*=\\s*${quotedLocalPathLikePattern}[^)]*\\)${localOnlyPathResultBoundaryPattern}`;
const scriptingFileApiPathArgumentPattern =
  `open\\s*\\([^)]*${quotedLocalPathLikePattern}[^)]*\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}|` +
  `${pythonSubprocessRunnerPathArgumentPattern}|` +
  `${pythonSubprocessRunnerWorkingDirectoryPattern}|` +
  `open\\s+[^;\\n]*${quotedLocalPathLikePattern}${localOnlyPathResultBoundaryPattern}|` +
  `(?:os\\.(?:listdir|lstat|makedirs|mkdir|remove|rename|replace|rmdir|scandir|stat|unlink)|shutil\\.(?:copy|copy2|copyfile|move|rmtree))\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)(?:\\.[a-z_][a-z0-9_]*\\([^)]*\\))*${localOnlyPathResultBoundaryPattern}|` +
  `(?:pathlib\\.)?path\\(\\s*${quotedLocalPathLikePattern}\\s*\\)\\.(?:exists|glob|is_dir|is_file|iterdir|mkdir|open|read_bytes|read_text|rename|replace|rglob|rmdir|stat|unlink|write_bytes|write_text)\\(\\s*(?:[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:file\\.(?:binread|binwrite|delete|exist\\?|open|read|unlink|write)|dir\\.(?:children|entries|foreach|glob|mkdir|rmdir))\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${scriptingFileApiCallChainPattern}${localOnlyPathResultBoundaryPattern}|` +
  `(?:copy|file_exists|file_get_contents|file_put_contents|fopen|is_dir|is_file|mkdir|rename|rmdir|scandir|unlink)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:io\\.(?:input|lines|open|output)|lfs\\.(?:attributes|chdir|dir|mkdir|rmdir|symlinkattributes)|(?:do|load)file)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:read(?:lines|bin|char)?|read\\.(?:csv|table)|file\\.(?:access|exists|info|remove|rename)|dir(?:\\.exists)?|list\\.files|normalizepath|fileread|exist|copyfile|movefile|delete)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:abspath|fullfile|joinpath|file\\.path|normpath|realpath)\\([^)]*${quotedLocalPathLikePattern}[^)]*\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:(?:path::tiny::)?path|file::spec->catfile)\\([^)]*${quotedLocalPathLikePattern}[^)]*\\)${scriptingFileApiCallChainPattern}${localOnlyPathResultBoundaryPattern}|` +
  `(?:file::slurp::(?:read_file|write_file)|io::file(?:->|::)new)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${scriptingFileApiCallChainPattern}${localOnlyPathResultBoundaryPattern}`;
const languageRuntimeLocalPathPattern =
  `(?:process\\.cwd\\(\\)|os\\.homedir\\(\\)|path\\.home\\(\\)|pathlib\\.path\\.home\\(\\))${localOnlyPathResultBoundaryPattern}|` +
  `(?:process\\.env\\.${localOnlyVariableNamePattern}|__dirname|__filename|__file__|__dir__|` +
  `import\\.meta\\.(?:dirname|url))${localOnlyReferenceBoundaryPattern}`;
const languageRuntimeDirectoryHelperPattern =
  `require\\(\\s*["'](?:node:)?os["']\\s*\\)\\.(?:homedir|tmpdir)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `os\\.(?:tmpdir|userhomedir|usercachedir|userconfigdir|tempdir|getwd|getcwd|getcwdb)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `tempfile\\.gettempdirb?\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:pathlib\\.)?path\\.(?:home|cwd)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:std::)?env::(?:current_dir|temp_dir)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `dirs(?:_next)?::(?:home_dir|cache_dir|config_dir|data_dir|config_local_dir|data_local_dir)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `dir\\.(?:home|pwd|tmpdir)${localOnlyReferenceBoundaryPattern}|` +
  `file\\.expand_path\\(\\s*["']~(?:/[^"']*)?["']\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:getcwd|sys_get_temp_dir|get_current_dir_name)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:directory\\.getcurrentdirectory\\(\\)|path\\.gettemppath\\(\\))${localOnlyPathResultBoundaryPattern}|` +
  `(?:appcontext\\.basedirectory|environment\\.currentdirectory)${localOnlyReferenceBoundaryPattern}`;
const rustLocalDirectoryPathJoinPattern =
  `(?:(?:std::)?env::(?:current_dir|temp_dir)\\(\\)|dirs(?:_next)?::(?:home_dir|cache_dir|config_dir|data_dir|config_local_dir|data_local_dir)\\(\\))` +
  `(?:\\.(?:unwrap|ok)\\(\\)|\\.expect\\([^)]*\\)|\\?)*\\.join\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}`;
const languageRuntimePathExpansionPattern =
  `path\\.(?:resolve|join|normalize)\\(\\s*${quotedLocalPathLikePattern}(?:\\s*,[^)]*)?\\)${localOnlyPathResultBoundaryPattern}|` +
  `${dotNetPathConstructorPattern}|` +
  `${dotNetFileSystemPathArgumentPattern}|` +
  `${dotNetProcessRunnerPathArgumentPattern}|` +
  `${dotNetProcessRunnerWorkingDirectoryPattern}|` +
  `${dotNetProcessRunnerWorkingDirectoryAssignmentPattern}|` +
  `${javascriptFileApiPathArgumentPattern}|` +
  `${javaPathConstructorPattern}|` +
  `${jvmFileSystemPathArgumentPattern}|` +
  `${jvmProcessRunnerPathArgumentPattern}|` +
  `${absolutePathHelperPattern}|` +
  `${goFileSystemPathArgumentPattern}|` +
  `${goProcessRunnerPathArgumentPattern}|` +
  `${goProcessRunnerWorkingDirectoryAssignmentPattern}|` +
  `${rustFileSystemPathArgumentPattern}|` +
  `${rustProcessRunnerPathArgumentPattern}|` +
  `${rustProcessRunnerWorkingDirectoryPattern}|` +
  `${cFileSystemPathArgumentPattern}|` +
  `${cppFileSystemPathArgumentPattern}|` +
  `${scriptingFileApiPathArgumentPattern}|` +
  `${rustLocalDirectoryPathJoinPattern}|` +
  `os\\.path\\.(?:abspath|realpath|expanduser)\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `os\\.path\\.expandvars\\(\\s*${quotedLocalVariableReferencePattern}\\s*\\)${localOnlyReferenceBoundaryPattern}|` +
  `${dotNetPathStaticPrefixPattern}getfullpath\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:pathlib\\.)?path\\(\\s*${quotedLocalPathLikePattern}\\s*\\)\\.(?:resolve|absolute|expanduser)\\(\\)${localOnlyPathResultBoundaryPattern}|` +
  `file\\.expand_path\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `realpath\\(\\s*${quotedLocalPathLikePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}`;
const languageRuntimeEnvironmentAccessorPattern =
  `process\\.env\\[\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\]${localOnlyPathResultBoundaryPattern}|` +
  `(?:deno|bun)\\.env\\.get\\(\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `(?:deno|bun)\\.env\\.${localOnlyVariableNamePattern}${localOnlyReferenceBoundaryPattern}|` +
  `os\\.(?:environ\\[\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\]|environ\\.get\\(\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\)|getenv\\(\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\))${localOnlyPathResultBoundaryPattern}|` +
  `env\\[\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\]${localOnlyPathResultBoundaryPattern}|` +
  `(?:std::)?env::var(?:_os)?\\(\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\)${localOnlyPathResultBoundaryPattern}|` +
  `system\\.(?:getenv\\(\\s*${quotedLocalOnlyVariableNamePattern}\\s*\\)|getproperty\\(\\s*["']${localOnlyRuntimePropertyNamePattern}["']\\s*\\))${localOnlyPathResultBoundaryPattern}`;
const localPathRootPattern =
  `${fileUriEnvironmentLocalPathValuePattern}${localOnlyReferenceBoundaryPattern}|` +
  `${relativeFileUriLocalPathValuePattern}${localOnlyReferenceBoundaryPattern}|` +
  `file:(?:\\.\\.?[/\\\\]|(?:/{0,2})[a-z]:[/\\\\]|[/\\\\])|` +
  `[a-z]:[/\\\\]|` +
  `[/\\\\]{2}[^/\\\\\\s]|` +
  `[/\\\\](?:users?|home|tmp|var|private|mnt|volumes|etc)(?:[/\\\\]|$)`;
const localDirectoryCommandPathPattern =
  `(?:${commandLocalRelativeNonNamespacePathPattern}|` +
  `${fileUriEnvironmentLocalPathValuePattern}|` +
  `${relativeFileUriLocalPathValuePattern}|` +
  `file:(?:\\.\\.?[/\\\\][^\\s)"'\\],;|&<>]*|(?:/{0,2})[a-z]:[/\\\\][^\\s)"'\\],;|&<>]*|[/\\\\][^\\s)"'\\],;|&<>]*)|` +
  `[a-z]:[/\\\\][^\\s)"'\\],;|&<>]*|` +
  `[/\\\\]{2}[^/\\\\\\s][^\\s)"'\\],;|&<>]*|` +
  `[/\\\\](?:users?|home|tmp|var|private|mnt|volumes|etc)(?:[/\\\\][^\\s)"'\\],;|&<>]*)?)`;
const shellWorkingDirectoryChangeCommandPattern =
  `(?:cd|chdir|pushd|set-location|sl|push-location)(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+` +
  `${localDirectoryCommandPathPattern}${localOnlyReferenceBoundaryPattern}`;
const powerShellWorkingDirectoryPathOptionPattern =
  `(?:cd|chdir|set-location|sl|push-location|pushd)(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+` +
  `-(?:literalpath|path)${powerShellPathOptionValueSeparatorPattern}${localDirectoryCommandPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellToolLocalPathCommandPattern =
  '(?:age|ansible(?:-inventory|-playbook)?|aws|az|buildah|cargo|cosign|crane|cypress|docker(?:-compose)?|eslint|gcloud|git|go|helm|jest|kubectl|make|mocha|nerdctl|npm|npx|op|oras|packer|playwright|pnpm|podman|pulumi|pytest|skopeo|sops|ssh|terraform|terragrunt|tofu|tsc|tsx|vault|vite|vitest|yarn)';
const shellToolLocalPathOptionNamePattern =
  `(?:-[cfiopr]|-(?:ca[-_]?cert|ca[-_]?path|chdir|client[-_]?cert|client[-_]?key|config|coverprofile|` +
  `cpuprofile|env[-_]?file|memprofile|mutexprofile|trace|var[-_]?file)|` +
  `--(?:authfile|basetemp|ca[-_]?bundle|ca[-_]?cert|ca[-_]?file|ca[-_]?path|cacert|capath|cache|cache-folder|` +
  `cert(?:ificate)?|cert[-_]?dir|cert[-_]?file|certificate[-_]?authority|` +
  `client[-_]?cert(?:ificate)?|client[-_]?key|` +
  `confcutdir|config|config-file|cov[-_]?config|cov[-_]?report|` +
  `coverage(?:[-.]?directory)|credential[-_]?file[-_]?override|cwd|dir|directory|env[-_]?file|file|` +
  `filter|global[-_.]?(?:setup|teardown)|globalconfig|global-folder|hosts[-_]?dir|identity|ignore[-_]?path|` +
  `inventory|junitxml|key|key[-_]?file|keychain|keyring|kubeconfig|` +
  `makefile|manifest-path|modules-folder|out[-_]?dir|output|output[-_]?file|prefix|project|` +
  `private[-_]?key|(?:src|dest)[-_]?authfile|registry[-_]?config|reporter-output|` +
  `repository[-_]?cache|repository[-_]?config|require|` +
  `resolve[-_]?plugins[-_]?relative[-_]?to|resolver|rootdir|rules[-_]?dir|` +
  `setup[-_.]?files(?:[-_.]?after[-_.]?env)?|snapshot[-_.]?resolver|` +
  `store-dir|target-dir|test[-_.]?results[-_.]?processor|tls(?:[-_]?ca)?[-_]?cert|tls[-_]?key|` +
  `tlscacert|tlscert|tlskey|token[-_]?file|tsconfig|userconfig|values|var[-_]?file|workspace))`;
const shellToolCompactLocalPathShortOptionPattern = `-[cfiopr](?![a-z0-9_-]+=)`;
const shellToolLocalPathOptionPattern =
  `${shellToolLocalPathCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `(?:${shellToolLocalPathOptionNamePattern}(?:\\s+|[=:]\\s*)|${shellToolCompactLocalPathShortOptionPattern})` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellToolNestedLocalPathOptionPattern =
  `${shellToolLocalPathCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `--(?:cov[-_]?report|reporter-options)(?:\\s+|[=:]\\s*)[a-z0-9_.-]+(?:=|:)${commandLocalRelativeNonNamespacePathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellToolLocalPathRedirectionPattern =
  `${shellToolLocalPathCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s*` +
  `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellInfrastructureDirectLocalPathOptionPattern =
  `${shellToolLocalPathCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `(?:-k|--(?:from[-_]?env[-_]?file|from[-_]?file|project[-_]?directory))(?:\\s+|[=:]\\s*)` +
  `(?![^\\s)"'\\],;|&<>]*=)${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellInfrastructureKeyedLocalPathOptionPattern =
  `${shellToolLocalPathCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `--(?:build-context|from[-_]?env[-_]?file|from[-_]?file|mount|secret|set[-_]?file|ssh)(?:\\s+|[=:]\\s*)` +
  `[^\\s)"'\\];|&<>]*(?:=|src=|source=)${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellInfrastructureCompactRelativePathOptionPattern =
  `kubectl(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+-k` +
  `${commandRelativeOrHomeLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellDockerVolumeLocalPathOptionPattern =
  `docker(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+(?:-v|--volume)(?:\\s+|[=:]\\s*)` +
  `${commandLocalRelativeNonNamespaceVolumeSourcePathPattern}(?::[^\\s)"'\\],;|&<>]+)?${localOnlyReferenceBoundaryPattern}`;
const shellInfrastructurePositionalLocalPathPattern =
  `(?:ansible-playbook|docker\\s+build|helm\\s+(?:dependency\\s+(?:build|update)|install|lint|package|template|upgrade)|` +
  `kubectl\\s+kustomize)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${commandExplicitLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellKustomizeRelativePathPattern =
  `kustomize(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${commandRelativeOrHomeLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellToolLocalPathEnvironmentNamePattern =
  `(?:ansible_(?:collections_paths?|config|inventory|library|module_utils|private_key_file|roles_path|vault_password_file)|` +
  `ant_(?:home|opts)|` +
  `aws_(?:config_file|shared_credentials_file)|azure_config_dir|buildah_authfile|` +
  `bazel(?:isk)?_(?:home|output_base|output_user_root|startup_options)|` +
  `cargo_(?:build_target_dir|config|config_path|home|target_dir)|` +
  `bundle_(?:app_config|cache_path|gemfile|path)|` +
  `cc|ccache_(?:base_dir|configpath|dir|temppath)|cflags|cmake_(?:args|build_dir|install_prefix|module_path|prefix_path|toolchain_file)|cpp|cppflags|cxx|cxxflags|` +
  `classpath|` +
  `cloudsdk_config|containers_auth_file|docker_(?:cert_path|config)|` +
  `composer_(?:auth|cache_dir|home)|` +
  `dapp_(?:libraries|root)|` +
  `buf_(?:cache_dir|config|workspace)|graphql_codegen_config|` +
  `openapi_generator_(?:config|ignore_file|template_dir)|proto(?:c|buf)_(?:include|path|plugin)|` +
  `protobuf_include_paths?|redocly_config|spectral_ruleset|typedoc_(?:options|out|tsconfig)|` +
  `act_(?:cache_dir|workflow|workflows)|buildkite_(?:agent_config|build_checkout_path|pipeline)|` +
  `circleci_config|dagger_(?:config|module)|drone_yaml|gitlab_runner_config|justfile|taskfile|task_temp_dir|` +
  `asciidoctor_(?:safe|template_dir)|docusaurus_(?:config|out_dir)|hugo_(?:cache_dir|config|destination|source)|` +
  `jupyter_(?:config_dir|data_dir|runtime_dir)|mdbook_(?:book_dir|dest_dir)|mkdocs_config|` +
  `pandoc_(?:data_dir|defaults|resource_path)|quarto_project_dir|sphinx_(?:build_dir|source_dir)|` +
  `checkov_(?:config|config_file|external_modules_download_path)|cyclonedx_(?:output_file|sbom_file)|` +
  `dependency_check_(?:data|data_directory|nvd_datafeed|out|suppression|suppression_file)|` +
  `detect_secrets_(?:baseline|config)|gitleaks_config|grype_(?:config|db_cache_dir)|hadolint_config|` +
  `kics_(?:config|output_path|path|queries_path)|osv_scanner_(?:config|lockfile|output)|` +
  `semgrep_(?:config|rules|settings_file)|shellcheckrc|snyk_(?:cache_path|cfg|config|policy_path)|` +
  `syft_(?:cache_dir|config)|terrascan_(?:config|output|policy_path)|tfsec_config(?:_file)?|` +
  `trivy_(?:cache_dir|config|db_repository|output)|` +
  `artillery_(?:config|output)|autocannon_(?:har|output)|bombardier_output|hey_output|jmeter_(?:home|properties|report_dir|result_file|testplan)|` +
  `k6_(?:archive|config|out|summary_export)|locust_(?:config|locustfile|logfile)|oha_output|siege_(?:rc|urls)|` +
  `vegeta_(?:input|output|targets)|wrk_script|` +
  `database_(?:url|uri)|dotnet_(?:cli_home|root(?:_[a-z0-9]+)?)|` +
  `eslint_(?:config|cache_location|config_path)|` +
  `git_(?:alternate_object_directories|config(?:_global|_system)?|dir|index_file|object_directory|ssh(?:_command)?|work_tree)|` +
  `gnupghome|google_application_credentials|jest_(?:config|junit_output)|` +
  `flyway_config_files|foundry_(?:cache_path|config|out|root)|` +
  `gem_(?:home|path|spec_cache)|` +
  `gradle_(?:opts|user_home)|hardhat_config|helm_(?:registry_config|repository_cache|repository_config)|ivy_home|` +
  `java_(?:home|opts|tool_options)|javac_opts|jdk_java_options|kotlin_home|kubeconfig|` +
  `ld|ldflags|liquibase_(?:defaults_file|home)|` +
  `maven_opts|meson_(?:build_root|source_root)|mocha_(?:config|options)|msbuild(?:debugpath|exepath|extensionspath|sdkspath)|` +
  `mysql_(?:histfile|home|test_login_file)|node_(?:options|path)|` +
  `nuget_(?:http_cache_path|packages|plugins_cache_path)|` +
  `packer_(?:cache_dir|config|config_dir|plugin_path)|pdm_(?:cache_dir|config_file|home)|pg(?:passfile|servicefile|sysconfdir)|` +
  `pip_(?:cache_dir|config_file|constraint|find_links|requirement)|` +
  `pipenv_pipfile|poetry_(?:cache_dir|config_dir|home|virtualenvs_path)|` +
  `php_ini_scan_dir|` +
  `npm_config_(?:cache|globalconfig|prefix|userconfig)|op_config_dir|oras_config|pnpm_(?:home|store_dir)|` +
  `prisma_schema|pulumi_(?:config_passphrase_file|home|template_path)|python(?:home|path)|` +
  `registry_auth_file|ruby(?:lib|opt)|rust(?:doc)?flags|rustc_(?:wrapper|workspace_wrapper)|` +
  `rustup_home|sbt_opts|coursier_(?:cache|config_dir)|sops_age_key_file|ssh_auth_sock|` +
  `solc_(?:binary|path)|sqlcmdini|ssl_cert_(?:dir|file)|tox_(?:ini|work_dir)|` +
  `terragrunt_(?:config|download|download_dir|tf_?path|working_dir)|` +
  `tf_(?:cli_config_file|data_dir|plugin_cache_dir)|tofu_(?:cli_config_file|data_dir|plugin_cache_dir)|` +
  `ts_node_project|tsx_tsconfig_path|uv_(?:cache_dir|config_file|project_environment)|` +
  `vault_(?:cacert|capath|client_cert|client_key)|virtual_env|` +
  `vite_config|vitest_config|yarn_(?:cache_folder|global_folder|rc_filename))`;
const shellToolLocalPathEnvironmentValuePattern =
  `(?:${commandLocalRelativeNonNamespacePathPattern}|[^\\s)"'\\],;|&<>]*[=:]${commandLocalRelativeNonNamespacePathPattern}|` +
  `[^)"'\\],;|&<>]*\\s+${commandLocalRelativeNonNamespacePathPattern})`;
const shellToolLocalPathEnvironmentAssignmentPattern =
  `(?:\\$env:${shellToolLocalPathEnvironmentNamePattern}|(?:set|setx)\\s+${shellToolLocalPathEnvironmentNamePattern}|` +
  `${shellToolLocalPathEnvironmentNamePattern})\\s*=\\s*${shellToolLocalPathEnvironmentValuePattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellJvmBuildToolCommandPattern = '(?:cs|coursier|gradle|gradlew|maven|mill|mvn|mvnw|sbt)';
const shellJvmBuildToolLocalPathOptionPattern =
  `${shellJvmBuildToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `(?:(?:-(?:b|c|g|gs|i|s|t|sbt[-_]?boot|sbt[-_]?dir)|--(?:build[-_]?file|cache|global[-_]?settings|gradle[-_]?user[-_]?home|` +
  `home|init[-_]?script|ivy[-_]?home|local[-_]?repository|out|project[-_]?cache[-_]?dir|repository|` +
  `sbt[-_]?boot|sbt[-_]?dir|settings|settings[-_]?file|toolchains))(?:\\s+|[=:]\\s*)|` +
  `-D(?:coursier\\.cache|gradle\\.user\\.home|ivy\\.home|maven\\.(?:repo\\.local|user\\.(?:conf|settings))|` +
  `org\\.gradle\\.(?:java\\.home|projectcachedir)|sbt\\.(?:boot\\.directory|global\\.base|ivy\\.home))=)` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellDotNetBuildToolCommandPattern = '(?:dotnet|msbuild|nuget)';
const shellDotNetBuildToolLocalPathOptionPattern =
  `${shellDotNetBuildToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:configfile|o|output|packagesdirectory|settings)|` +
  `--(?:artifacts[-_]?path|configfile|diag|errorlog|logfile|output|packages|results[-_]?directory|settings))` +
  `(?:\\s+|[=:]\\s*)|` +
  `(?:/(?:bl|binarylogger)(?::|=)|` +
  `(?:/p:|/property:)(?:baseintermediateoutputpath|intermediateoutputpath|msbuildprojectextensionspath|` +
  `nugetpackageroot|outputpath|packageoutputpath|restoreconfigfile|restorepackagespath|restorerepositorypath|` +
  `vstestresultsdirectory)=))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellDotNetBuildToolKeyedLocalPathOptionPattern =
  `${shellDotNetBuildToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:--logger|-l)(?:\\s+|[=:]\\s*)[^\\s)"'\\],;|&<>]*(?:;|,)logfilename=${commandLocalRelativeNonNamespacePathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellJvmRuntimeToolCommandPattern = '(?:ant|jar|jarsigner|java|javac|javadoc|keytool|kotlin|kotlinc|scala|scalac)';
const shellJvmRuntimeLocalPathOptionPattern =
  `${shellJvmRuntimeToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:[a-z]*f[a-z]*|buildfile|classpath|cp|d|extdirs|jar|keystore|signedjar|sourcepath)|` +
  `--(?:class[-_]?path|file|module[-_]?path|processor[-_]?path|source[-_]?path|upgrade[-_]?module[-_]?path))` +
  `(?:\\s+|[=:]\\s*)|` +
  `-D(?:java\\.(?:io\\.tmpdir|library\\.path|ext\\.dirs|endorsed\\.dirs)|user\\.(?:dir|home)|` +
  `javax\\.net\\.ssl\\.(?:keyStore|trustStore))=|` +
  `-Xbootclasspath(?:/[ap])?:)` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellJvmRuntimeKeyedLocalPathOptionPattern =
  `${shellJvmRuntimeToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `--patch[-_]?module(?:\\s+|[=:]\\s*)[^\\s)"'\\],;|&<>]+=\\s*${commandLocalRelativeNonNamespacePathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellPhpRubyToolCommandPattern = '(?:bundle|bundler|composer|gem|phpunit|rake|rspec)';
const shellPhpRubyToolLocalPathOptionPattern =
  `${shellPhpRubyToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:c|f|I)|--(?:bootstrap|cache[-_]?dir|cache[-_]?directory|configuration|coverage[-_]?clover|` +
  `coverage[-_]?cobertura|coverage[-_]?html|coverage[-_]?xml|install[-_]?dir|log[-_]?junit|out|output|` +
  `require|working[-_]?dir))(?:\\s+|[=:]\\s*)|` +
  `--(?:coverage[-_]?php|coverage[-_]?text)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellPhpRubyToolConfigSetLocalPathPattern =
  `bundler?(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+config\\s+(?:set\\s+)?` +
  `(?:cache_path|gemfile|path)\\s+${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellPythonPackageToolCommandPattern =
  `(?:(?:(?:python3?|py)(?:\\s+${shellCommandSkippableTokenPattern}){0,3}\\s+-m\\s+)?pip(?:3|x)?|uv\\s+pip)`;
const shellPythonPackageToolLocalPathOptionPattern =
  `${shellPythonPackageToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `(?:(?:-(?:c|e|r|t))\\s*|--(?:cache[-_]?dir|cert|client[-_]?cert|constraint|editable|` +
  `find[-_]?links|prefix|requirement|requirements|root|src|target)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellPythonEnvToolCommandPattern = '(?:hatch|nox|pdm|pipenv|poetry|tox|uv)';
const shellPythonEnvToolLocalPathOptionPattern =
  `${shellPythonEnvToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `(?:(?:-(?:C|c|f))\\s*|--(?:config(?:[-_]?file)?|directory|envdir|noxfile|project|root|toxfile|` +
  `workdir|work[-_]?dir)(?:\\s+|[=:]\\s*))${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellPythonLintToolCommandPattern = '(?:black|coverage|flake8|mypy|pyright|pytest|ruff)';
const shellPythonLintToolLocalPathOptionPattern =
  `${shellPythonLintToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,10}\\s+` +
  `(?:(?:-(?:c|o))\\s*|--(?:append[-_]?config|basetemp|cache[-_]?dir|config(?:[-_]?file)?|` +
  `cov[-_]?config|cov[-_]?report|data[-_]?file|junitxml|output[-_]?file|project|rcfile|rootdir)` +
  `(?:\\s+|[=:]\\s*))${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellPythonVirtualenvPositionalLocalPathPattern =
  `(?:(?:python3?|py)(?:\\s+${shellCommandSkippableTokenPattern}){0,3}\\s+-m\\s+venv|virtualenv)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,6}\\s+${commandDirectoryLocalPathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const databaseCommandLocalPathValuePattern = `(?:(?:filesystem|sqlite3?|file):)?${commandLocalRelativePathPattern}`;
const databaseCommandLocalNonNamespacePathValuePattern =
  `(?:(?:filesystem|sqlite3?|file):)?${commandLocalRelativeNonNamespacePathPattern}`;
const shellDatabaseToolCommandPattern =
  '(?:drizzle-kit|flyway|liquibase|mariadb|mysql|mysqldump|pg_dump|pg_restore|prisma|psql|sqlcmd|sqlite3?)';
const shellDatabaseToolLocalPathOptionPattern =
  `${shellDatabaseToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:f|i|o))\\s*|` +
  `--(?:change[-_]?log[-_]?file|changelogfile|config|config[-_]?files|configfiles|data[-_]?output|` +
  `defaults(?:[-_]?extra)?[-_]?file|defaultsfile|file|input|output|result[-_]?file|schema|` +
  `url|workdir|work[-_]?dir)(?:\\s+|[=:]\\s*)|` +
  `-(?:change[-_]?log[-_]?file|changelogfile|config[-_]?files|configfiles|locations|url)=)` +
  `${databaseCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellDatabaseToolPositionalLocalPathPattern =
  `(?:pg_restore|sqlite3?)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${databaseCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellDatabaseToolInputRedirectionPattern =
  `(?:mariadb|mysql|psql|sqlite3?)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `<\\s*${databaseCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellIacToolCommandPattern = '(?:packer|pulumi|terraform|terragrunt|tofu)';
const shellIacToolLocalPathOptionPattern =
  `${shellIacToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:backend[-_]?config|backup|chdir|config|config[-_]?file|from[-_]?module|out|` +
  `plugin[-_]?dir|state|state[-_]?out|var[-_]?file))(?:\\s+|[=:]\\s*)|` +
  `--(?:config|config[-_]?file|cwd|download[-_]?dir|file|policy[-_]?pack|secrets[-_]?provider|` +
  `terragrunt[-_]?config|terragrunt[-_]?download[-_]?dir|terragrunt[-_]?source|` +
  `terragrunt[-_]?tfpath|terragrunt[-_]?tf[-_]?path|terragrunt[-_]?working[-_]?dir|` +
  `tfpath|tf[-_]?path|working[-_]?dir)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellIacToolPositionalLocalPathPattern =
  `${shellIacToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${commandRelativeOrHomeLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellIacToolRedirectionPattern =
  `${shellIacToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s*` +
  `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellNativeBuildToolCommandPattern =
  '(?:ar|bazel(?:isk)?|c\\+\\+|cc|ccache|clang(?:\\+\\+)?|cmake|g\\+\\+|gcc|ld(?:\\.lld)?|lld|meson|ninja|pkg-config)';
const nativeBuildCommandLocalPathValuePattern =
  `(?:["'](?:~(?:[/\\\\][^"']*)?|\\.\\.|\\.\\.?[/\\\\][^"']*|[^"':\\\\]*[/\\\\][^"']*|` +
  `[^"'/\\\\:]*\\.[a-z0-9][a-z0-9_-]*)["']|~(?:[/\\\\][^\\s)"'\\],;|&<>]+)?|` +
  `\\.\\.|\\.\\.[/\\\\][^\\s)"'\\],;|&<>]+|${unquotedLocalPathLikePattern})`;
const nativeBuildLocalFileExtensionPattern =
  `(?:${knownLocalEvidenceFileExtensionPattern}|a|c|cc|cmake|cpp|cxx|h|hh|hpp|hxx|ini|lib|mk|ninja|o|obj|s|so)`;
const nativeBuildKnownNamespaceNameArgumentPattern =
  `(?!(?:[a-z0-9_.]+\\.${nativeBuildLocalFileExtensionPattern})${localOnlyReferenceBoundaryPattern})` +
  `${shellKnownNamespaceNameTextPattern}${localOnlyReferenceBoundaryPattern}`;
const nativeBuildCommandLocalNonNamespacePathValuePattern =
  `(?!${nativeBuildKnownNamespaceNameArgumentPattern})${nativeBuildCommandLocalPathValuePattern}`;
const shellNativeBuildToolLocalPathOptionPattern =
  `${shellNativeBuildToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:B|C|F|I|L|MF|MQ|MT|S|ar|builddir|config|cross-file|fdebug-prefix-map|` +
  `ffile-prefix-map|fmacro-prefix-map|gcc-toolchain|include|imacros|isysroot|isystem|native-file|o|prefix|sysroot))` +
  `(?:\\s+|[=:]?\\s*)|` +
  `--(?:ar|bazelrc|build|builddir|cache[-_]?dir|cross[-_]?file|debug[-_]?prefix[-_]?map|` +
  `disk[-_]?cache|file[-_]?prefix[-_]?map|gcc[-_]?toolchain|include[-_]?directory|install|` +
  `libdir|native[-_]?file|output[-_]?base|output[-_]?user[-_]?root|pkgconfigdir|prefix|` +
  `program[-_]?prefix|source[-_]?dir|sysroot|toolchain)(?:\\s+|[=:]\\s*)|` +
  `--set[-_]?config=[a-z0-9_.-]+=)` +
  `${nativeBuildCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellNativeBuildToolKeyedLocalPathOptionPattern =
  `${shellNativeBuildToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-D|--(?:action[-_]?env|define|repo[-_]?env)(?:\\s+|[=:]\\s*))` +
  `[a-z0-9_.-]*(?:dir|file|home|path|prefix|root)[a-z0-9_.-]*=|` +
  `(?:-Wl,)?-rpath(?:\\s+|[=,]\\s*))${nativeBuildCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellNativeBuildToolPositionalLocalPathPattern =
  `(?:cmake|meson|ninja)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${nativeBuildCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellNativeBuildToolRedirectionPattern =
  `${shellNativeBuildToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s*` +
  `${shellRedirectionOperatorPattern}\\s*${nativeBuildCommandLocalNonNamespacePathValuePattern}${localOnlyReferenceBoundaryPattern}`;
const shellSchemaCodegenToolCommandPattern =
  '(?:buf|graphql-codegen|openapi-generator(?:-cli)?|protoc|redocly|spectral|swagger-codegen(?:-cli)?|typedoc)';
const shellSchemaCodegenToolLocalPathOptionPattern =
  `${shellSchemaCodegenToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:I|i|o|r|t))\\s*|` +
  `--(?:config|config[-_]?file|descriptor[-_]?set[-_]?(?:in|out)|exclude[-_]?path|include[-_]?path|` +
  `input|input[-_]?spec|out|output|output[-_]?dir|options|path|proto[-_]?path|ruleset|schema|template|` +
  `template[-_]?dir|tsconfig)(?:\\s+|[=:]\\s*)|` +
  `--(?:cpp|csharp|descriptor[-_]?set|doc|go|grpc|grpc[-_]?gateway|java|js|kotlin|objc|openapiv2|` +
  `php|python|ruby|rust|ts)[-_]?out=)` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellSchemaCodegenToolKeyedLocalPathOptionPattern =
  `${shellSchemaCodegenToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `--(?:additional[-_]?properties|opt|option|plugin)(?:\\s+|[=:]\\s*)` +
  `[^\\s)"'\\],;|&<>]*(?:=|:)${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellSchemaCodegenToolPositionalLocalPathPattern =
  `(?:buf\\s+generate|protoc|redocly\\s+(?:build-docs|bundle|lint)|spectral\\s+lint)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+${commandRelativeOrHomeLocalPathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellCiToolCommandPattern = '(?:act|buildkite-agent|circleci|dagger|drone|gitlab-runner|just|task)';
const shellCiToolLocalPathOptionPattern =
  `${shellCiToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:C|W|c|f|m))\\s*|` +
  `--(?:checkout|config|config[-_]?file|cwd|env[-_]?file|file|justfile|module|mod|pipeline|project[-_]?dir|` +
  `taskfile|workdir|working[-_]?directory|workflow|workflows)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellCiToolVolumeLocalPathOptionPattern =
  `${shellCiToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `--(?:docker[-_]?volumes|volume|volumes)(?:\\s+|[=:]\\s*)` +
  `${commandLocalRelativeNonNamespaceVolumeSourcePathPattern}(?::[^\\s)"'\\],;|&<>]+)?${localOnlyReferenceBoundaryPattern}`;
const shellCiToolPositionalLocalPathPattern =
  `(?:buildkite-agent\\s+pipeline\\s+upload|drone\\s+exec|task\\s+--taskfile|just\\s+--justfile)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+${commandLocalRelativeNonNamespacePathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellDocReportToolCommandPattern =
  '(?:asciidoctor|docusaurus|hugo|jupyter(?:\\s+nbconvert)?|mdbook|mkdocs|nbconvert|pandoc|papermill|quarto|sphinx-build)';
const shellDocReportToolLocalPathOptionPattern =
  `${shellDocReportToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:c|d|f|o|s))\\s*|` +
  `--(?:bibliography|build[-_]?dir|cache[-_]?dir|config|config[-_]?file|css|csl|data[-_]?dir|defaults|` +
  `dest[-_]?dir|destination|epub[-_]?cover[-_]?image|include[-_]?after[-_]?body|include[-_]?before[-_]?body|` +
  `include[-_]?in[-_]?header|metadata[-_]?file|output|output[-_]?dir|out[-_]?dir|project[-_]?dir|` +
  `resource[-_]?path|site[-_]?dir|source|template|template[-_]?dir|template[-_]?file)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellDocReportToolPositionalLocalPathPattern =
  `(?:asciidoctor|jupyter\\s+nbconvert|mdbook\\s+build|mkdocs\\s+build|nbconvert|pandoc|papermill|` +
  `quarto\\s+render|sphinx-build)(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${commandRelativeOrHomeLocalPathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellSecurityScannerToolCommandPattern =
  '(?:checkov|cyclonedx(?:-bom|-npm)?|dependency-check|detect-secrets|gitleaks|grype|hadolint|kics|' +
  'osv-scanner|semgrep|shellcheck|snyk|syft|terrascan|tfsec|trivy|trufflehog)';
const shellSecurityScannerToolLocalPathOptionPattern =
  `${shellSecurityScannerToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:c|d|f|o|p))\\s*|` +
  `--(?:baseline|cache[-_]?dir|config|config[-_]?file|config[-_]?path|data(?:[-_]?directory)?|` +
  `data[-_]?feed|db[-_]?cache[-_]?dir|db[-_]?repository|dependency[-_]?tree|exclude[-_]?path|` +
  `external[-_]?modules[-_]?download[-_]?path|file|ignore(?:[-_]?file)?|ignorefile|` +
  `json[-_]?file[-_]?output|lockfile|manifest|out|output|output[-_]?file|output[-_]?file[-_]?path|` +
  `output[-_]?path|path|policy[-_]?path|project[-_]?path|queries[-_]?path|report|report[-_]?file|` +
  `report[-_]?path|reports?[-_]?dir|results?[-_]?dir|rules|sarif[-_]?file|sarif[-_]?output|` +
  `scan|scan[-_]?path|scan[-_]?paths|sbom(?:[-_]?file)?|source|suppression|suppression[-_]?file|` +
  `template)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellSecurityScannerOptionTokenPattern =
  `(?:-[a-z0-9]+(?:\\s+[^\\s)"'\\],;|&<>]+)?|--[a-z0-9][a-z0-9_.-]*(?:[=:][^\\s)"'\\],;|&<>]+|\\s+[^\\s)"'\\],;|&<>]+)?)`;
const shellSecurityScannerPathSourcePattern =
  `(?:dir:|file:|fs:|sbom:)?${commandRelativeOrHomeLocalPathPattern}`;
const shellSecurityScannerToolPositionalLocalPathPattern =
  `(?:checkov|dependency-check|detect-secrets\\s+scan|gitleaks\\s+detect|grype|kics\\s+scan|semgrep\\s+scan|` +
  `shellcheck|syft|terrascan\\s+scan|tfsec|trivy\\s+fs|trufflehog\\s+filesystem)` +
  `(?:\\s+${shellSecurityScannerOptionTokenPattern}){0,8}\\s+${shellSecurityScannerPathSourcePattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellSecurityScannerToolRedirectionPattern =
  `${shellSecurityScannerToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s*` +
  `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellBenchmarkToolCommandPattern =
  '(?:ab|artillery|autocannon|bombardier|hey|jmeter|k6|locust|oha|siege|vegeta|wrk)';
const shellBenchmarkToolLocalPathOptionPattern =
  `${shellBenchmarkToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:f|g|l|o|O|r|s|t))\\s*|` +
  `-(?:config|csv|csv[-_]?full[-_]?history|csv[-_]?prefix|input|locustfile|logfile|output|targets|testplan)` +
  `(?:\\s+|[=:]\\s*)|` +
  `--(?:archive|config|config[-_]?file|csv|csv[-_]?full[-_]?history|csv[-_]?prefix|export|file|har|html|` +
  `input|jmeter(?:[-_]?property)?(?:[-_]?file)?|log(?:[-_]?file)?|locustfile|out|output|output[-_]?file|` +
  `properties|property[-_]?file|report(?:[-_]?dir|[-_]?file)?|results?[-_]?file|script|script[-_]?file|` +
  `summary[-_]?export|target|targets|test|test[-_]?plan|testplan|urls?|url[-_]?file)(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellBenchmarkToolKeyedLocalPathOptionPattern =
  `${shellBenchmarkToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:o|O)|--(?:out|output|summary[-_]?export))(?:\\s+|[=:]\\s*)` +
  `[^\\s)"'\\],;|&<>]+(?:=|:)${commandLocalRelativeNonNamespacePathPattern})${localOnlyReferenceBoundaryPattern}`;
const shellBenchmarkToolPositionalLocalPathPattern =
  `(?:artillery\\s+(?:report|run)|k6\\s+(?:archive|inspect|run)|locust|siege|wrk)` +
  `(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+${commandRelativeOrHomeLocalPathPattern}` +
  `${localOnlyReferenceBoundaryPattern}`;
const shellBenchmarkToolRedirectionPattern =
  `${shellBenchmarkToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s*` +
  `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellRustWasmToolCommandPattern =
  '(?:cargo(?:-clippy)?|clippy-driver|rustc|rustdoc|rustfmt|rustup|wasm-bindgen|wasm-pack)';
const shellRustWasmToolLocalPathOptionPattern =
  `${shellRustWasmToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:C|L|o))\\s*|--(?:config|manifest[-_]?path|out[-_]?dir|output|sysroot|target[-_]?dir)` +
  `(?:\\s+|[=:]\\s*))${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellRustWasmToolKeyedLocalPathOptionPattern =
  `${shellRustWasmToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:--extern(?:\\s+|[=:]\\s*)[^\\s)"'\\],;|&<>]+=|--config(?:\\s+|[=:]\\s*)[^\\s)"'\\],;|&<>]+=|` +
  `--remap[-_]?path[-_]?prefix(?:\\s+|[=:]\\s*)|-C\\s*[^\\s)"'\\],;|&<>]+=)` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellRustWasmToolPositionalLocalPathPattern =
  `wasm-bindgen(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}|` +
  `wasm-pack(?:\\s+${shellCommandSkippableTokenPattern}){0,8}\\s+` +
  `${commandDirectoryLocalPathPattern}${localOnlyReferenceBoundaryPattern}|` +
  `rustup(?:\\s+${shellCommandSkippableTokenPattern}){0,4}\\s+toolchain\\s+link\\s+${shellCommandArgumentPattern}\\s+` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellEvmToolCommandPattern = '(?:anvil|cast|forge|hardhat|solc)';
const shellEvmToolLocalPathOptionPattern =
  `${shellEvmToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `(?:(?:-(?:c|o)|--(?:allow[-_]?paths|base[-_]?path|cache[-_]?path|config|config[-_]?path|` +
  `contracts|dump[-_]?state|hardhat[-_]?config|include[-_]?path|lib[-_]?paths|load[-_]?state|` +
  `out|output|output[-_]?dir|paths|root|state|state[-_]?file))(?:\\s+|[=:]\\s*))` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const shellEvmToolKeyedLocalPathOptionPattern =
  `${shellEvmToolCommandPattern}(?:\\s+${shellCommandSkippableTokenPattern}){0,12}\\s+` +
  `--(?:libraries|remappings)(?:\\s+|[=:]\\s*)[^\\s)"'\\],;|&<>]*(?:=|:)` +
  `${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`;
const localEditorFileUriEnvironmentRootPattern =
  `(?:\\$(?:\\{(?:env:)?${localOnlyVariableNamePattern}\\}|(?:env:)?${localOnlyVariableNamePattern})|` +
  `${windowsEnvironmentVariableReferencePattern})(?:[/\\\\]|$)`;
const localEditorFileUriPattern =
  `(?:vscode(?:-insiders)?|vscodium|cursor)://file/(?:[a-z]:[/\\\\]|` +
  `~(?:[a-z0-9._-]+)?(?:[/\\\\]|$)|` +
  `${localEditorFileUriEnvironmentRootPattern}|` +
  `[/\\\\]?(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:[/\\\\]|$))`;
const evidenceTargetBindingNamePattern =
  `(?:source[-_ ]?target|evidence[-_ ]?target|validated[-_ ]?target|validation[-_ ]?target|` +
  `(?:artifact|report|transcript|input|output|approval|approvals)[-_ ]?target|` +
  `(?:artifact[-_ ]?targets?|target[-_ ]?bindings)(?:\\s*[./]\\s*[a-z0-9._-]+|\\s*\\[\\s*["']?[a-z0-9._-]+["']?\\s*\\])*|` +
  `target|command[-_ ]?(?:output|target))`;
const evidenceTargetBindingSeparatorPattern = new RegExp(
  `(?:^|[\\s("'[<=,|;&\\x60])["']?${evidenceTargetBindingNamePattern}["']?\\s*[:=]\\s*["']?$`,
  'i',
);
const artifactUriEvidenceTargetReferencePattern = new RegExp(
  `^\\s*["']?(?:${evidenceTargetBindingNamePattern}\\s*[:=]\\s*["']?)?artifact://`,
  'i',
);
const artifactUriEmbeddedEvidenceTargetBindingPattern = new RegExp(
  `^\\s*["']?(?:${evidenceTargetBindingNamePattern}\\s*[:=]\\s*["']?)?artifact://[^\\s]*[/?#&=,:;|@<>\\(\\)\\[\\]\\{\\}]` +
    `(["']?${evidenceTargetBindingNamePattern}["']?\\s*[:=].*)`,
  'i',
);
const artifactUriControlEvidenceTargetBindingSeparatorPattern = new RegExp(
  `(artifact://[^\\s\\x00-\\x1f\\x7f]*)([\\t\\n\\f\\r\\v]+)(["']?${evidenceTargetBindingNamePattern}["']?\\s*[:=])`,
  'gi',
);
const evidenceTargetBindingPrefixPattern =
  `(?:^|[\\s("'[<=,|;&\\x60])["']?${evidenceTargetBindingNamePattern}["']?\\s*[:=]\\s*["']?`;
const evidenceTargetObjectBindingPattern = new RegExp(
  `(?:^|[\\s("'[<=,|;&\\x60/?#@{}])["']?${evidenceTargetBindingNamePattern}["']?\\s*[:=]\\s*\\{([^}\\r\\n]{1,512})\\}`,
  'i',
);
const evidenceTargetObjectBindingArrayValuePattern =
  /(?:^|[,;{])\s*["']?[a-z0-9._ -]{1,80}["']?\s*[:=]\s*\[([^\]\r\n]{1,512})\]/gi;
const evidenceTargetObjectBindingValuePattern =
  /(?:^|[,;{])\s*["']?([a-z0-9._ -]{1,80})["']?\s*[:=]\s*(["']?[^\s"'{}\],;|&<>]+["']?)/gi;
const uriSchemeObjectBindingKeyPattern = /^[a-z][a-z0-9+.-]*$/i;
const shellBareRedirectionReferencePattern = new RegExp(
  `(?:^\\s*(?:${evidenceTargetBindingNamePattern}\\s*[:=]\\s*)?|${evidenceTargetBindingNamePattern}\\s*[:=]\\s*)` +
    `${shellRedirectionOperatorPattern}\\s*${commandLocalRelativeNonNamespacePathPattern}${localOnlyReferenceBoundaryPattern}`,
  'i',
);
const driveRelativeEvidenceTargetReferencePattern = new RegExp(
  `(?:^\\s*["']?${driveRelativeEvidenceTargetValuePattern}|` +
    `${evidenceTargetBindingPrefixPattern}${driveRelativeEvidenceTargetValuePattern})${localOnlyReferenceBoundaryPattern}`,
  'i',
);
const localRootEvidenceTargetReferencePattern = new RegExp(
  `(?:^\\s*["']?(?:${localPathRootPattern})|${evidenceTargetBindingPrefixPattern}(?:${localPathRootPattern}))`,
  'i',
);
const localOnlyInspectionReferencePattern = new RegExp(
  `(?:^|[\\s("'[<=,|;&\\x60])(?:~(?:[a-z0-9._-]+)?(?:[/\\\\]|$)|` +
    `${shellLocalOnlyParameterExpansionPattern}|` +
    `${shellLocalOnlyParameterExpansionAdjacentPathPattern}|` +
    `${shellScriptRunnerInlineBareRedirectionPattern}|` +
    `${shellScriptRunnerPathArgumentPattern}|` +
    `${gitObjectPathArgumentPattern}|` +
    `${shellGitToolLocalPathOptionPattern}|` +
    `${shellGitBundleCreateLocalPathPattern}|` +
    `${shellGitCloneLocalPathPattern}|` +
    `${shellGitWorktreeAddLocalPathPattern}|` +
    `${shellGitPatchInputLocalPathPattern}|` +
    `${shellFileCommandPathArgumentPattern}|` +
    `${shellProcessWorkingDirectoryArgumentPattern}|` +
    `${powerShellStartProcessFilePathArgumentPattern}|` +
    `${powerShellStartProcessRedirectLocalPathArgumentPattern}|` +
    `${powerShellStartProcessPositionalLocalPathPattern}|` +
    `${powerShellSelectXmlPathArgumentPattern}|` +
    `${powerShellWebOutputLocalPathPattern}|` +
    `${powerShellBitsTransferLocalPathPattern}|` +
    `${powerShellSaveCommandLocalPathPattern}|` +
    `${powerShellContentFileLocalPathPattern}|` +
    `${powerShellTeeObjectLocalPathPattern}|` +
    `${powerShellItemLocalPathPattern}|` +
    `${powerShellItemMutationLocalPathPattern}|` +
    `${powerShellItemPropertyLocalPathPattern}|` +
    `${powerShellArchiveLocalPathPattern}|` +
    `${powerShellPSDriveLocalPathPattern}|` +
    `${powerShellLocalizedDataLocalPathPattern}|` +
    `${powerShellFormatTypeDataLocalPathPattern}|` +
    `${powerShellSerializedDataLocalPathPattern}|` +
    `${powerShellAddTypeLocalPathPattern}|` +
    `${powerShellCommandDiscoveryLocalPathPattern}|` +
    `${powerShellHelpLocalPathPattern}|` +
    `${powerShellWinEventLocalPathPattern}|` +
    `${powerShellCounterLocalPathPattern}|` +
    `${powerShellCounterDataLocalPathPattern}|` +
    `${powerShellCertificateLocalPathPattern}|` +
    `${powerShellJobInvocationLocalPathPattern}|` +
    `${powerShellModuleCommandLocalPathPattern}|` +
    `${powerShellPSSessionModuleOutputLocalPathPattern}|` +
    `${powerShellModuleManifestLocalPathPattern}|` +
    `${powerShellModuleManifestTestLocalPathPattern}|` +
    `${powerShellDataFileLocalPathPattern}|` +
    `${powerShellModulePublishLocalPathPattern}|` +
    `${powerShellExportConsoleLocalPathPattern}|` +
    `${powerShellTranscriptLocalPathPattern}|` +
    `${powerShellSessionConfigurationLocalPathPattern}|` +
    `${powerShellPathParameterCommandLocalPathPattern}|` +
    `${powerShellObjectOutputCommandRedirectionPattern}|` +
    `${shellFileCommandRedirectionPattern}|` +
    `${shellFileCommandAdjacentRedirectionPattern}|` +
    `${shellControlRedirectionPattern}|` +
    `${shellBuiltinRedirectionPattern}|` +
    `${windowsForCommandLocalPathPattern}|` +
    `${windowsRegistryImportLocalPathPattern}|` +
    `${windowsCertificateRequestLocalPathPattern}|` +
    `${windowsScheduledTaskXmlLocalPathPattern}|` +
    `${windowsInventoryCommandRedirectionPattern}|` +
    `${powerShellHashtableLocalPathAssignmentPattern}|` +
    `${shellSourceCommandPathArgumentPattern}|` +
    `${shellDotSourceLocalPathPattern}|` +
    `${shellPowerShellCallOperatorLocalPathPattern}|` +
    `${shellLocalOnlyCommandSubstitutionPattern}|` +
    `${shellLocalOnlyCommandSubstitutionAdjacentPathPattern}|` +
    `${shellCdPwdCommandSubstitutionPattern}|` +
    `${powerShellLocalPathMemberPattern}|` +
    `${powerShellLocalProviderPathPattern}|` +
    `${powerShellLocalRegistryRootPattern}|` +
    `${powerShellLocalFileSystemRootPattern}|` +
    `${windowsEnvironmentAdjacentPathPattern}|` +
    `${powerShellEnvironmentAdjacentPathPattern}|` +
    `${dotNetLocalOnlyPathCallPattern}|` +
    `${languageRuntimeLocalPathPattern}|` +
    `${languageRuntimeDirectoryHelperPattern}|` +
    `${languageRuntimePathExpansionPattern}|` +
    `${languageRuntimeEnvironmentAccessorPattern}|` +
    `\\$(?:\\{(?:env:)?${localOnlyVariableNamePattern}\\}|(?:env:)?${localOnlyVariableNamePattern})${localOnlyReferenceBoundaryPattern}|` +
    `%${localOnlyVariableNamePattern}%${localOnlyReferenceBoundaryPattern}|%~[a-z]*[0-9]|!${localOnlyVariableNamePattern}!${localOnlyReferenceBoundaryPattern}|` +
    `${shellWorkingDirectoryChangeCommandPattern}|` +
    `${powerShellWorkingDirectoryPathOptionPattern}|` +
    `${shellToolLocalPathOptionPattern}|` +
    `${shellToolNestedLocalPathOptionPattern}|` +
    `${shellToolLocalPathRedirectionPattern}|` +
    `${shellInfrastructureDirectLocalPathOptionPattern}|` +
    `${shellInfrastructureKeyedLocalPathOptionPattern}|` +
    `${shellInfrastructureCompactRelativePathOptionPattern}|` +
    `${shellDockerVolumeLocalPathOptionPattern}|` +
    `${shellInfrastructurePositionalLocalPathPattern}|` +
    `${shellKustomizeRelativePathPattern}|` +
    `${shellToolLocalPathEnvironmentAssignmentPattern}|` +
    `${shellJvmBuildToolLocalPathOptionPattern}|` +
    `${shellDotNetBuildToolLocalPathOptionPattern}|` +
    `${shellDotNetBuildToolKeyedLocalPathOptionPattern}|` +
    `${shellJvmRuntimeLocalPathOptionPattern}|` +
    `${shellJvmRuntimeKeyedLocalPathOptionPattern}|` +
    `${shellPhpRubyToolLocalPathOptionPattern}|` +
    `${shellPhpRubyToolConfigSetLocalPathPattern}|` +
    `${shellPythonPackageToolLocalPathOptionPattern}|` +
    `${shellPythonEnvToolLocalPathOptionPattern}|` +
    `${shellPythonLintToolLocalPathOptionPattern}|` +
    `${shellPythonVirtualenvPositionalLocalPathPattern}|` +
    `${shellDatabaseToolLocalPathOptionPattern}|` +
    `${shellDatabaseToolPositionalLocalPathPattern}|` +
    `${shellDatabaseToolInputRedirectionPattern}|` +
    `${shellIacToolLocalPathOptionPattern}|` +
    `${shellIacToolPositionalLocalPathPattern}|` +
    `${shellIacToolRedirectionPattern}|` +
    `${shellNativeBuildToolLocalPathOptionPattern}|` +
    `${shellNativeBuildToolKeyedLocalPathOptionPattern}|` +
    `${shellNativeBuildToolPositionalLocalPathPattern}|` +
    `${shellNativeBuildToolRedirectionPattern}|` +
    `${shellSchemaCodegenToolLocalPathOptionPattern}|` +
    `${shellSchemaCodegenToolKeyedLocalPathOptionPattern}|` +
    `${shellSchemaCodegenToolPositionalLocalPathPattern}|` +
    `${shellCiToolLocalPathOptionPattern}|` +
    `${shellCiToolVolumeLocalPathOptionPattern}|` +
    `${shellCiToolPositionalLocalPathPattern}|` +
    `${shellDocReportToolLocalPathOptionPattern}|` +
    `${shellDocReportToolPositionalLocalPathPattern}|` +
    `${shellSecurityScannerToolLocalPathOptionPattern}|` +
    `${shellSecurityScannerToolPositionalLocalPathPattern}|` +
    `${shellSecurityScannerToolRedirectionPattern}|` +
    `${shellBenchmarkToolLocalPathOptionPattern}|` +
    `${shellBenchmarkToolKeyedLocalPathOptionPattern}|` +
    `${shellBenchmarkToolPositionalLocalPathPattern}|` +
    `${shellBenchmarkToolRedirectionPattern}|` +
    `${shellRustWasmToolLocalPathOptionPattern}|` +
    `${shellRustWasmToolKeyedLocalPathOptionPattern}|` +
    `${shellRustWasmToolPositionalLocalPathPattern}|` +
    `${shellEvmToolLocalPathOptionPattern}|` +
    `${shellEvmToolKeyedLocalPathOptionPattern}|` +
    `${localEditorFileUriPattern}|` +
    `${localPathRootPattern})`,
  'i',
);

export interface EvidenceRuntimeNameOptions {
  includeDeployedState?: boolean;
}

export function isEvidenceEnvironmentFileName(name: string): boolean {
  const normalizedName = normalizeEvidenceFileNameSegment(name);
  return normalizedName === envFileName || normalizedName.startsWith(`${envFileName}.`);
}

function normalizeEvidenceFileNameSegment(name: string): string {
  let normalized = unwrapEvidenceFileNameSegment(name.trim().toLowerCase());
  let allowNestedBindingValue = false;

  for (let index = 0; index < 4; index += 1) {
    const stripped = stripEvidenceFileNameBindingPrefix(normalized, allowNestedBindingValue);
    if (stripped === normalized) break;
    normalized = unwrapEvidenceFileNameSegment(stripped);
    allowNestedBindingValue = true;
  }

  return normalized.trim();
}

function stripEvidenceFileNameBindingPrefix(segment: string, allowNestedBindingValue: boolean): string {
  const bindingPrefix = /^(.{1,160}?)\s*[:=]\s*(.+)$/i.exec(segment);
  if (!bindingPrefix) return segment;

  const key = unwrapEvidenceFileNameSegment(bindingPrefix[1])
    .replace(/["'`{}()[\]]/g, '')
    .trim();
  if (!allowNestedBindingValue && !/(?:target|bindings?|input|path|file|evidence)/i.test(key)) return segment;

  return unwrapEvidenceFileNameSegment(bindingPrefix[2]);
}

function unwrapEvidenceFileNameSegment(segment: string): string {
  let normalized = segment.trim();

  for (let index = 0; index < 4; index += 1) {
    const unwrapped = normalized.replace(/^[\s"'`([{<]+/, '').replace(/[\s"'`)\]};>]+$/, '');
    if (unwrapped === normalized) break;
    normalized = unwrapped;
  }

  return normalized;
}

export function isEvidenceRuntimeDatabaseTarget(normalizedTarget: string): boolean {
  const normalizedRuntimeTarget = normalizeEvidenceFileNameSegment(normalizedTarget);
  const extension = extname(basename(normalizedRuntimeTarget));
  return runtimeDatabaseExtensions.has(extension) || runtimeDatabasePathPattern.test(normalizedRuntimeTarget);
}

export function isEvidenceSecretOrRuntimeName(
  normalizedTarget: string,
  options: EvidenceRuntimeNameOptions = {},
): boolean {
  return (
    normalizedTarget.includes(secretDlogFileName) ||
    normalizedTarget.includes('runtime-state') ||
    (options.includeDeployedState === true && normalizedTarget.includes('deployed_state.json')) ||
    secretBearingPathPattern.test(normalizedTarget)
  );
}

export function hasEvidenceLocalOnlyInspectionReference(normalizedTarget: string): boolean {
  const inspectionTarget = normalizeDecodedEvidenceTargetComponent(normalizedTarget);
  const artifactUriTrailingInspectionText = readArtifactUriTrailingInspectionText(inspectionTarget);
  const artifactUriEmbeddedEvidenceTargetBinding = artifactUriEmbeddedEvidenceTargetBindingPattern.exec(inspectionTarget);
  if (artifactUriTrailingInspectionText !== null && !artifactUriEmbeddedEvidenceTargetBinding) {
    return artifactUriTrailingInspectionText.length > 0
      ? hasEvidenceLocalOnlyInspectionReference(artifactUriTrailingInspectionText)
      : false;
  }

  if (artifactUriEmbeddedEvidenceTargetBinding) {
    return hasEvidenceLocalOnlyInspectionReference(artifactUriEmbeddedEvidenceTargetBinding[1]);
  }

  if (hasEvidenceTargetObjectBindingLocalOnlyReference(inspectionTarget)) return true;

  return (
    localOnlyInspectionReferencePattern.test(inspectionTarget) ||
    shellBareRedirectionReferencePattern.test(inspectionTarget) ||
    driveRelativeEvidenceTargetReferencePattern.test(inspectionTarget) ||
    localRootEvidenceTargetReferencePattern.test(inspectionTarget)
  );
}

function hasEvidenceTargetObjectBindingLocalOnlyReference(normalizedTarget: string): boolean {
  const objectBindingPattern = new RegExp(evidenceTargetObjectBindingPattern.source, 'gi');

  let inspectedBindings = 0;
  let objectBinding: RegExpExecArray | null;
  while ((objectBinding = objectBindingPattern.exec(normalizedTarget)) !== null && inspectedBindings < 16) {
    inspectedBindings += 1;
    const objectPayload = objectBinding[1];
    if (hasEvidenceTargetObjectArrayBindingLocalOnlyReference(objectPayload)) return true;

    const valuePattern = new RegExp(evidenceTargetObjectBindingValuePattern);
    let inspectedValues = 0;
    let value: RegExpExecArray | null;
    while ((value = valuePattern.exec(objectPayload)) !== null && inspectedValues < 16) {
      inspectedValues += 1;
      if (hasEvidenceTargetObjectValueLocalOnlyReference(value[1], value[2])) return true;
    }
  }

  return false;
}

function hasEvidenceTargetObjectArrayBindingLocalOnlyReference(objectPayload: string): boolean {
  const arrayPattern = new RegExp(evidenceTargetObjectBindingArrayValuePattern);

  let inspectedArrays = 0;
  let array: RegExpExecArray | null;
  while ((array = arrayPattern.exec(objectPayload)) !== null && inspectedArrays < 16) {
    inspectedArrays += 1;
    const members = array[1].split(/[,;]/);
    for (const member of members.slice(0, 32)) {
      if (hasEvidenceLocalOnlyInspectionReference(unwrapEvidenceFileNameSegment(member))) return true;
    }
  }

  return false;
}

function hasEvidenceTargetObjectValueLocalOnlyReference(rawKey: string, rawValue: string): boolean {
  const key = unwrapEvidenceFileNameSegment(rawKey);
  const value = unwrapEvidenceFileNameSegment(rawValue);
  if (uriSchemeObjectBindingKeyPattern.test(key) && value.startsWith('//')) {
    return hasEvidenceLocalOnlyInspectionReference(`${key}:${value}`);
  }

  return hasEvidenceLocalOnlyInspectionReference(value);
}

function readArtifactUriTrailingInspectionText(normalizedTarget: string): string | null {
  const artifactUriReference = artifactUriEvidenceTargetReferencePattern.exec(normalizedTarget);
  if (!artifactUriReference) return null;

  let quote: string | undefined;
  let depth = 0;

  for (let index = artifactUriReference[0].length; index < normalizedTarget.length; index += 1) {
    const char = normalizedTarget[index];
    const previousChar = index > 0 ? normalizedTarget[index - 1] : '';

    if (quote !== undefined) {
      if (char === quote && previousChar !== '\\') quote = undefined;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      continue;
    }

    if ((char === ')' || char === ']' || char === '}') && depth > 0) {
      depth -= 1;
      continue;
    }

    if (depth === 0 && /\s/.test(char)) return normalizedTarget.slice(index).trim();
  }

  return '';
}

export function evidenceTargetInspectionVariants(normalizedTarget: string): string[] {
  const variants = [normalizedTarget];
  let current = normalizedTarget;

  for (let index = 0; index < maxEvidenceTargetDecodeDepth; index += 1) {
    const decoded = decodeEvidenceTargetComponent(current);
    const decodedAlreadySeen = variants.includes(decoded);
    if (!decodedAlreadySeen) variants.push(decoded);

    const formUrlDecoded = decodeFormUrlEncodedEvidenceTargetComponent(decoded);
    if (!variants.includes(formUrlDecoded)) variants.push(formUrlDecoded);

    if (decoded === current || decodedAlreadySeen) break;
    current = decoded;
  }

  return variants;
}

function decodeEvidenceTargetComponent(normalizedTarget: string): string {
  try {
    return normalizeDecodedEvidenceTargetComponent(decodeURIComponent(normalizedTarget));
  } catch {
    return normalizeDecodedEvidenceTargetComponent(
      normalizedTarget.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
    );
  }
}

function decodeFormUrlEncodedEvidenceTargetComponent(decodedTarget: string): string {
  return decodedTarget.includes('+')
    ? normalizeDecodedEvidenceTargetComponent(decodedTarget.replace(/\+/g, ' '))
    : decodedTarget;
}

function normalizeDecodedEvidenceTargetComponent(decodedTarget: string): string {
  const shellDecodedTarget = decodePowerShellBacktickEvidenceEscapes(
    decodeBackslashEvidenceEscapes(
      decodedTarget
        .normalize('NFKC')
        .replace(/%U([0-9a-fA-F]{8})/g, decodeUnicodeCodePointEscape)
        .replace(/%u([0-9a-f]{4})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\x([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\u\{([0-9a-f]{1,6})\}/gi, decodeUnicodeCodePointEscape)
        .replace(/\\U([0-9a-fA-F]{8})/g, decodeUnicodeCodePointEscape)
        .replace(/\\N\{([A-Za-z][A-Za-z0-9 -]*)\}/g, decodeNamedUnicodePathMarkerEscape)
        .replace(/\\u+([0-9a-f]{4})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/gi, decodeCssHexPathMarkerEscape)
        .replace(/\\([0-7]{2,3})/g, decodeOctalPathMarkerEscape)
        .replace(/=([0-9a-fA-F]{2})/g, (match, hex: string, offset: number, target: string) =>
          evidenceTargetBindingSeparatorPattern.test(target.slice(0, offset + 1))
            ? match
            : decodeQuotedPrintablePathMarkerEscape(match, hex),
        )
        .replace(/&#(x[0-9a-f]+|\d+);?/gi, decodeNumericCharacterReference)
        .replace(/&([a-z][a-z0-9]+);/gi, decodeNamedCharacterReference)
        .replace(/&([a-z][a-z0-9]+)(?=[^a-z0-9=;]|$)/gi, decodeNamedCharacterReference)
        .replace(/\^([a-z0-9$%!:={}\(\).\/\\])/gi, '$1'),
    ),
  );

  return shellDecodedTarget
    .replace(artifactUriControlEvidenceTargetBindingSeparatorPattern, '$1 $3')
    .replace(/\\([:./])/g, '$1')
    .normalize('NFKC')
    .replace(unicodeFormatControlPattern, '')
    .replace(asciiControlPattern, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function decodeBackslashEvidenceEscapes(target: string): string {
  return target
    .replace(/(^|[^a-z0-9])f\\?i\\?l\\?e(?=\s*:)/gi, '$1file')
    .replace(/\\(?=[$%])/g, '')
    .replace(/%([^%\s"'`]+)%/g, (_match, variableName: string) => `%${variableName.replace(/\\/g, '')}%`)
    .replace(/\$\{([^}\s"'`]+)\}/g, (_match, variableName: string) => `\${${variableName.replace(/\\/g, '')}}`);
}

function decodePowerShellBacktickEvidenceEscapes(target: string): string {
  let decoded = '';
  let inBacktickCommandSubstitution = false;

  for (let index = 0; index < target.length; index += 1) {
    const char = target[index];
    if (char !== '`') {
      decoded += char;
      continue;
    }

    const nextChar = target[index + 1];
    if (nextChar === undefined) {
      decoded += char;
      continue;
    }

    if (inBacktickCommandSubstitution) {
      decoded += char;
      inBacktickCommandSubstitution = false;
      continue;
    }

    const previousChar = index > 0 ? target[index - 1] : '';
    if (target.slice(Math.max(0, index - 10), index).toLowerCase().endsWith('string.raw')) {
      decoded += char;
      inBacktickCommandSubstitution = true;
      continue;
    }

    if (isEvidenceShellTokenBoundary(previousChar) && /[a-z]/i.test(nextChar)) {
      decoded += char;
      inBacktickCommandSubstitution = true;
      continue;
    }

    if (/[a-z0-9$%!:={}\(\).\/\\]/i.test(nextChar)) {
      decoded += nextChar;
      index += 1;
      continue;
    }

    decoded += char;
  }

  return decoded;
}

function isEvidenceShellTokenBoundary(char: string): boolean {
  return char === '' || /[\s("'[<=,|;&]/.test(char);
}

function isValidUnicodeCodePoint(codePoint: number): boolean {
  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff;
}

function decodeUnicodeCodePointEscape(match: string, hex: string): string {
  const codePoint = Number.parseInt(hex, 16);

  return isValidUnicodeCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
}

function decodeCssHexPathMarkerEscape(match: string, hex: string): string {
  const codePoint = Number.parseInt(hex, 16);

  switch (codePoint) {
    case 0x2e:
      return '.';
    case 0x2f:
      return '/';
    case 0x3a:
      return ':';
    case 0x5c:
      return '\\';
    default:
      break;
  }

  const hasCssTerminator = match.length > hex.length + 1;
  const hasMaxLengthEscape = hex.length === 6;
  const isThreeDigitOctalEscape = /^[0-7]{3}$/.test(hex);

  return isValidUnicodeCodePoint(codePoint) &&
    (hasCssTerminator ||
      hasMaxLengthEscape ||
      (!isThreeDigitOctalEscape && isEvidenceTargetObfuscationCodePoint(codePoint)))
    ? String.fromCodePoint(codePoint)
    : match;
}

function isEvidenceTargetObfuscationCodePoint(codePoint: number): boolean {
  if (!isValidUnicodeCodePoint(codePoint)) return false;

  const char = String.fromCodePoint(codePoint);

  return /[a-z0-9]/i.test(char) || unicodeFormatControlCodePointPattern.test(char);
}

function decodeNamedUnicodePathMarkerEscape(match: string, name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ').toUpperCase();

  switch (normalizedName) {
    case 'COLON':
      return ':';
    case 'FULL STOP':
      return '.';
    case 'REVERSE SOLIDUS':
      return '\\';
    case 'SOLIDUS':
      return '/';
    default:
      return (
        decodeNamedUnicodeCompatibilityPathMarker(normalizedName) ??
        decodeNamedUnicodeAsciiAlphanumeric(normalizedName) ??
        decodeNamedUnicodeFormatControl(normalizedName) ??
        match
      );
  }
}

function decodeNamedUnicodeCompatibilityPathMarker(normalizedName: string): string | null {
  return namedUnicodeCompatibilityPathMarkerValues.get(normalizedName) ?? null;
}

function decodeNamedUnicodeAsciiAlphanumeric(normalizedName: string): string | null {
  const ligature = namedUnicodeLatinLigatureValues.get(normalizedName);
  if (ligature !== undefined) return ligature;

  const latinLetterMatch = normalizedName.match(/^(?:FULLWIDTH )?LATIN (SMALL|CAPITAL) LETTER ([A-Z])$/);
  if (latinLetterMatch) {
    const letter = latinLetterMatch[2];
    return latinLetterMatch[1] === 'SMALL' ? letter.toLowerCase() : letter;
  }

  const digitMatch = normalizedName.match(/^(?:FULLWIDTH )?DIGIT ([A-Z]+)$/);
  if (digitMatch) return namedUnicodeDigitValues.get(digitMatch[1]) ?? null;

  switch (normalizedName) {
    case 'CENTRELINE LOW LINE':
    case 'DASHED LOW LINE':
    case 'FULLWIDTH LOW LINE':
    case 'LOW LINE':
    case 'WAVY LOW LINE':
      return '_';
    case 'EM DASH':
    case 'EN DASH':
    case 'FIGURE DASH':
    case 'FULLWIDTH HYPHEN-MINUS':
    case 'HYPHEN-MINUS':
    case 'HYPHEN':
    case 'MINUS SIGN':
    case 'NON-BREAKING HYPHEN':
    case 'SMALL HYPHEN-MINUS':
      return '-';
    default:
      return null;
  }
}

function decodeNamedUnicodeFormatControl(normalizedName: string): string | null {
  const variationSelectorMatch = normalizedName.match(/^VARIATION SELECTOR-([1-9]|1[0-6])$/);
  if (variationSelectorMatch) return String.fromCodePoint(0xfe00 + Number.parseInt(variationSelectorMatch[1], 10) - 1);

  switch (normalizedName) {
    case 'ARABIC LETTER MARK':
      return '\u061c';
    case 'BYTE ORDER MARK':
    case 'ZERO WIDTH NO-BREAK SPACE':
      return '\ufeff';
    case 'COMBINING GRAPHEME JOINER':
      return '\u034f';
    case 'LEFT-TO-RIGHT MARK':
      return '\u200e';
    case 'MONGOLIAN VOWEL SEPARATOR':
      return '\u180e';
    case 'RIGHT-TO-LEFT MARK':
      return '\u200f';
    case 'SOFT HYPHEN':
      return '\u00ad';
    case 'WORD JOINER':
      return '\u2060';
    case 'ZERO WIDTH JOINER':
      return '\u200d';
    case 'ZERO WIDTH NON-JOINER':
      return '\u200c';
    case 'ZERO WIDTH SPACE':
      return '\u200b';
    default:
      return null;
  }
}

function decodeOctalPathMarkerEscape(match: string, octal: string): string {
  const codePoint = Number.parseInt(octal, 8);

  switch (codePoint) {
    case 0x2e:
      return '.';
    case 0x2f:
      return '/';
    case 0x3a:
      return ':';
    case 0x5c:
      return '\\';
    default:
      return isEvidenceTargetObfuscationCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match;
  }
}

function decodeQuotedPrintablePathMarkerEscape(match: string, hex: string): string {
  const codePoint = Number.parseInt(hex, 16);

  switch (codePoint) {
    case 0x2e:
      return '.';
    case 0x2f:
      return '/';
    case 0x3a:
      return ':';
    case 0x5c:
      return '\\';
    default:
      break;
  }

  if (!isValidUnicodeCodePoint(codePoint)) return match;

  const char = String.fromCodePoint(codePoint);

  return /[a-z0-9]/i.test(char) || unicodeFormatControlCodePointPattern.test(char) ? char : match;
}

function decodeNumericCharacterReference(match: string, value: string): string {
  const radix = value.toLowerCase().startsWith('x') ? 16 : 10;
  const codePointText = radix === 16 ? value.slice(1) : value;
  const codePoint = Number.parseInt(codePointText, radix);

  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : match;
}

function decodeNamedCharacterReference(match: string, name: string): string {
  const normalizedName = name.toLowerCase();

  switch (normalizedName) {
    case 'amp':
      return '&';
    case 'apos':
    case 'closecurlyquote':
    case 'opencurlyquote':
    case 'lsquo':
    case 'rsquo':
      return "'";
    case 'backslash':
    case 'bsol':
      return '\\';
    case 'commat':
      return '@';
    case 'colon':
      return ':';
    case 'dollar':
      return '$';
    case 'equals':
      return '=';
    case 'excl':
      return '!';
    case 'gt':
      return '>';
    case 'lcub':
    case 'lbrace':
      return '{';
    case 'lsqb':
    case 'lbrack':
      return '[';
    case 'lpar':
      return '(';
    case 'lowbar':
    case 'underbar':
      return '_';
    case 'lt':
      return '<';
    case 'emsp':
    case 'emsp13':
    case 'emsp14':
    case 'ensp':
    case 'hairsp':
    case 'mediumspace':
    case 'nbsp':
    case 'nonbreakingspace':
    case 'numsp':
    case 'puncsp':
    case 'thickspace':
    case 'thinspace':
    case 'thinsp':
    case 'verythinspace':
      return ' ';
    case 'num':
      return '#';
    case 'percnt':
      return '%';
    case 'plus':
      return '+';
    case 'bdquo':
    case 'closecurlydoublequote':
    case 'ldquo':
    case 'opencurlydoublequote':
    case 'quot':
    case 'rdquo':
      return '"';
    case 'quest':
      return '?';
    case 'semi':
      return ';';
    case 'rcub':
    case 'rbrace':
      return '}';
    case 'rsqb':
    case 'rbrack':
      return ']';
    case 'rpar':
      return ')';
    case 'grave':
      return '`';
    case 'hat':
      return '^';
    case 'dash':
    case 'hyphen':
    case 'mdash':
    case 'minus':
    case 'ndash':
    case 'nonbreakinghyphen':
      return '-';
    case 'period':
      return '.';
    case 'shy':
      return '\u00ad';
    case 'frasl':
    case 'sol':
      return '/';
    case 'tab':
      return '\t';
    case 'newline':
      return '\n';
    case 'af':
    case 'applyfunction':
      return '\u2061';
    case 'it':
    case 'invisibletimes':
      return '\u2062';
    case 'ic':
    case 'invisiblecomma':
      return '\u2063';
    case 'fflig':
      return 'ff';
    case 'filig':
      return 'fi';
    case 'fllig':
      return 'fl';
    case 'ffilig':
      return 'ffi';
    case 'ffllig':
      return 'ffl';
    case 'lrm':
      return '\u200e';
    case 'rlm':
      return '\u200f';
    case 'nobreak':
      return '\u2060';
    case 'negativemediumspace':
    case 'negativethickspace':
    case 'negativethinspace':
    case 'negativeverythinspace':
      return '\u200b';
    case 'zerowidthspace':
      return '\u200b';
    case 'zwnj':
      return '\u200c';
    case 'zwj':
      return '\u200d';
    default:
      return match;
  }
}
