Patch MediaWiki to support base64 images
========================================


Version information
-------------------

Name                        | Version
----------------------------|-----------------------------
MediaWiki version           | 1.25.1
WYSIWYG-CKeditor version    | 1.5.6_0 [B551+13.03.2015]


Goals
-----

- Install WYSIWYG editor module (based on CKeditor) in MediaWiki

- Make MediaWiki support base64 images, where the image information
  is embedded directly in the `<img src="....`.

- Make the WYSIWYG plugin support base64 images


Hint
----

- The changes that need to be made are given in __git diff__ format.
  You can apply them using
  `git apply --ignore-space-change --ignore-whitespace` and then entering
  the patch to _stdin_. Clearly, this does only work if the original files
  did not change in the meantime.


Install WYSIWYG module
----------------------

- Go to the MediaWiki help page:
  <https://www.mediawiki.org/wiki/Extension:WYSIWYG>.
  You will find the indicated version in the table on that site. In our case:
  <https://github.com/Mediawiki-wysiwyg/WYSIWYG-CKeditor>.

- Install it as indicated: Copy the extension files into your wiki, and
  update your `./LocalSettings.php`. In our case, we deactivated the
  WikiEditor and SemanticForms extensions, so we can skip these includes.
  Furthermore, as base64 images produce huge texts, we increase the
  maximum article size of a wiki article. After configuring some permissions,
  this leaves us with the following code (append it to the file):

    ```php
    $wgMaxArticleSize = 65536; // kilobytes

    #13.11.13->
    require_once( "$IP/extensions/WYSIWYG/WYSIWYG.php" );

    # Examples of setting permissions using $wgGroupPermissions, for more detailed explanation see:
    #   https://www.mediawiki.org/wiki/Manual:$wgGroupPermissions#Example
    # $wgGroupPermissions['user']['wysiwyg'] = true; //Only registered users are allowed to use wysiwyg
    # $wgGroupPermissions['*']['wysiwyg'] = true;    //Everyone is allowed to use wysiwyg
    $wgGroupPermissions['*']['wysiwyg'] = true;
    $wgGroupPermissions['*']['createpage'] = false;
    $wgGroupPermissions['*']['edit'] = false;
    $wgGroupPermissions['user']['createpage'] = true;
    $wgGroupPermissions['user']['edit'] = true;
    $wgGroupPermissions['user']['upload'] = true;
    $wgGroupPermissions['user']['delete'] = true;
    $wgGroupPermissions['user']['undelete'] = true;
    $wgGroupPermissions['user']['deletedhistory'] = true;
    $wgGroupPermissions['user']['deletedtext'] = true;
    $wgGroupPermissions['autoconfirmed']['upload'] = true;
    $wgAllowExternalImages = true;
    $wgEnableImageWhitelist = true;
    $wgAllowImageTag = true;
    $wgRawHtml = true;

    $wgDefaultUserOptions['cke_show'] = 'richeditor';    //Enable CKEditor
    $wgDefaultUserOptions['riched_use_toggle'] = false;  //Editor can toggle CKEditor/WikiText
    $wgDefaultUserOptions['riched_start_disabled'] = false; //Important!!! else bug...
    $wgDefaultUserOptions['riched_toggle_remember_state'] = true; //working/bug?
    $wgDefaultUserOptions['riched_use_popup'] = false;   //Deprecated

    ##These are not compatible with WYSIWYG
    $wgFCKEditorExcludedNamespaces[] = NS_MEDIAWIKI;
    $wgFCKEditorExcludedNamespaces[] = NS_TEMPLATE;
    #13.11.13<-
    ```
- At this point, your WYSIWYG editor should already work. You can upload your
  images manually and link them. The following steps will enable base64
  images, which is especially useful for copy-pasting from e.g. LibreOffice
  or Word as well as from your clipboard.


Patching MediaWiki
------------------

- **Outline**: Make MediaWiki understand links of the form
  `[[File:data:image/...]]` in addition to the classic `[[File:pic.jpg]]`.
  Usually, the image title and filename are linked. This is not the case
  for base64 strings, which is why we need to pass another parameter around,
  containing the original _src_.

- File: `./includes/Linker.php`:

    ```diff
    diff --git a/includes/Linker.php b/includes/Linker.php
    index b58daba..7fd73e0 100644
    --- a/includes/Linker.php
    +++ b/includes/Linker.php
    @@ -536,12 +536,12 @@ class Linker {
             */
            public static function makeImageLink( Parser $parser, Title $title,
                    $file, $frameParams = array(), $handlerParams = array(), $time = false,
    -               $query = "", $widthOption = null
    +               $query = "", $widthOption = null, $origLink = ''
            ) {
                    $res = null;
                    $dummy = new DummyLinker;
                    if ( !Hooks::run( 'ImageBeforeProduceHTML', array( &$dummy, &$title,
    -                       &$file, &$frameParams, &$handlerParams, &$time, &$res ) ) ) {
    +                       &$file, &$frameParams, &$handlerParams, &$time, &$res, $origLink ) ) ) {
                            return $res;
                    }

    @@ -650,7 +650,12 @@ class Linker {
                    }

                    if ( !$thumb ) {
    -                       $s = self::makeBrokenImageLinkObj( $title, $fp['title'], '', '', '', $time == true );
    +                       if ( stripos($origLink, 'file:data:image/', 0) === 0 ) {
    +                               # This is a base64 image!
    +                               $s = '<img src="'.substr($origLink, 5).'">';
    +                       } else {
    +                               $s = self::makeBrokenImageLinkObj( $title, $fp['title'], '', '', '', $time == true );
    +                       }
                    } else {
                            self::processResponsiveImages( $file, $thumb, $hp );
                            $params = array(
    @@ -838,8 +843,14 @@ class Linker {
                            . "<div class=\"thumbinner\" style=\"width:{$outerWidth}px;\">";

                    if ( !$exists ) {
    -                       $s .= self::makeBrokenImageLinkObj( $title, $fp['title'], '', '', '', $time == true );
    -                       $zoomIcon = '';
    +                       $filename = $title->getPartialURL();
    +                       if ( stripos($filename, 'data:image/', 0) === 0 ) {
    +                               # This is a base64 image!
    +                               $s = '<img src="'.$title->getPartialURL().'">';
    +                       } else {
    +                               $s .= self::makeBrokenImageLinkObj( $title, $fp['title'], '', '', '', $time == true );
    +                               $zoomIcon = '';
    +                       }
                    } elseif ( !$thumb ) {
                            $s .= wfMessage( 'thumbnail_error', '' )->escaped();
                            $zoomIcon = '';

    ```

- File `./includes/parser/Parser.php`

    ```diff
    diff --git a/includes/parser/Parser.php b/includes/parser/Parser.php
    index ace63a0..8534161 100644
    --- a/includes/parser/Parser.php
    +++ b/includes/parser/Parser.php
    @@ -2240,8 +2235,8 @@ class Parser {
                  $holders->merge( $this->replaceInternalLinks2( $text ) );
                }
                # cloak any absolute URLs inside the image markup, so replaceExternalLinks() won't touch them
                $s .= $prefix . $this->armorLinks(
    -							$this->makeImage( $nt, $text, $holders ) ) . $trail;
    +							$this->makeImage( $nt, $text, $holders, $origLink ) ) . $trail;
              } else {
                $s .= $prefix . $trail;
              }
    @@ -4853,10 +4849,15 @@ class Parser {
        // [[|page]] (reverse pipe trick: add context from page title)
        $p2 = "/\[\[\\|($tc+)]]/";

    -		# try $p1 first, to turn "[[A, B (C)|]]" into "[[A, B (C)|A, B]]"
    -		$text = preg_replace( $p1, '[[\\1\\2\\3|\\2]]', $text );
    -		$text = preg_replace( $p4, '[[\\1\\2\\3|\\2]]', $text );
    -		$text = preg_replace( $p3, '[[\\1\\2\\3\\4|\\2]]', $text );
    +		# Base64 images fix: They are just too long sometimes!
    +		$new_backtrack_limit = 10000000; // default = 100000
    +		ini_set("pcre.backtrack_limit", $new_backtrack_limit);
    +		if ( strlen($text) < $new_backtrack_limit ) {
    +			# try $p1 first, to turn "[[A, B (C)|]]" into "[[A, B (C)|A, B]]"
    +			$text = preg_replace( $p1, '[[\\1\\2\\3|\\2]]', $text );
    +			$text = preg_replace( $p4, '[[\\1\\2\\3|\\2]]', $text );
    +			$text = preg_replace( $p3, '[[\\1\\2\\3\\4|\\2]]', $text );
    +		}

        $t = $this->mTitle->getText();
        $m = array();
    @@ -5481,7 +5482,7 @@ class Parser {
       * @param LinkHolderArray|bool $holders
       * @return string HTML
       */
    -	public function makeImage( $title, $options, $holders = false ) {
    +	public function makeImage( $title, $options, $holders = false, $origLink = '' ) {
        # Check if the options text is of the form "options|alt text"
        # Options are:
        #  * thumbnail  make a thumbnail with enlarge-icon and caption, alignment depends on lang
    @@ -5517,13 +5518,18 @@ class Parser {
          array( $this, $title, &$options, &$descQuery ) );
        # Fetch and register the file (file title may be different via hooks)
        list( $file, $title ) = $this->fetchFileAndTitle( $title, $options );
    +		# Workaround for base64 images
    +		$isBase64image = false;
    +		if ( stripos($origLink, 'file:data:image/', 0) === 0 ) {
    +			$isBase64image = true;
    +		}

        # Get parameter map
        $handler = $file ? $file->getHandler() : false;

        list( $paramMap, $mwArray ) = $this->getImageParams( $handler );

    -		if ( !$file ) {
    +		if ( !$file && !$isBase64image ) {
          $this->addTrackingCategory( 'broken-file-category' );
        }

    @@ -5681,8 +5687,9 @@ class Parser {

        # Linker does the rest
        $time = isset( $options['time'] ) ? $options['time'] : false;
    +
        $ret = Linker::makeImageLink( $this, $title, $file, $params['frame'], $params['handler'],
    -			$time, $descQuery, $this->mOptions->getThumbSize() );
    +			$time, $descQuery, $this->mOptions->getThumbSize(), $origLink );

        # Give the handler a chance to modify the parser object
        if ( $handler ) {
    ```

- File `./includes/title/MediaWikiTitleCodec.php`:

    ```diff
    diff --git a/includes/title/MediaWikiTitleCodec.php b/includes/title/MediaWikiTitleCodec.php
    index 20034b7..23f5764 100644
    --- a/includes/title/MediaWikiTitleCodec.php
    +++ b/includes/title/MediaWikiTitleCodec.php
    @@ -202,6 +202,11 @@ class MediaWikiTitleCodec implements TitleFormatter, TitleParser {
       *         'user_case_dbkey', and 'dbkey'.
       */
      public function splitTitleString( $text, $defaultNamespace = NS_MAIN ) {
    +		if ( stripos($text, 'file:data:image/', 0) === 0 ) {
    +			$text = "inline_image";
    +			$defaultNamespace = NS_FILE;
    +		}
    +
        $dbkey = str_replace( ' ', '_', $text );

        # Initialisation
    ```

- At this point, MediaWiki should support base64 images. You can try this by
  using the basic editor (i.e. disable the WYSIWYG editor in LocalSettings
  or the online settings panel). The next step is to make CKeditor support
  base64 as well.


Patching the WYSIWYG extension
------------------------------

- **Outline**: Basically, we begin with the same thing as before: Make
  CKeditor understand base64 links.

- File: `./extensions/WYSIWYG/CKeditorLinker.php`:

    ```diff
    diff --git a/extensions/WYSIWYG/CKeditorLinker.php b/extensions/WYSIWYG/CKeditorLinker.php
    index e4a51dd..7942080 100644
    --- a/extensions/WYSIWYG/CKeditorLinker.php
    +++ b/extensions/WYSIWYG/CKeditorLinker.php
    @@ -93,11 +93,12 @@ class CKeditorLinker {
              * @since 1.20
              * @return String: HTML for an image, with links, wrappers, etc.
            */
    -      static function makeImageLink2( $skin, Title $nt, $file, $frameParams = array(), $handlerParams = array(), $time, &$ret ) {
    -			  global $IP, $wgUploadDirectory;
    -			  $orginal = $nt->getText();
    +      static function makeImageLink2( $skin, Title $nt, $file, $frameParams = array(), $handlerParams = array(), $time, &$ret, $origLink ) {
    +              global $IP, $wgUploadDirectory;
    +              $orginal = $nt->getText();
                   $file = RepoGroup::singleton()->getLocalRepo()->newFile( $nt );
                   $found = $file->exists();
    +              $is_base64 = (stripos($origLink, 'file:data:image/') === 0);

                   if( !empty( $frameParams['alt'] ) && $frameParams['alt'] == 'RTENOTITLE' ){ // 2223
                           $frameParams['alt'] = '';
    @@ -131,6 +132,14 @@ class CKeditorLinker {
                   $imgWidth = '';
                   $imgHeight = ''; //30.12.14 RL<-

    +              if( $is_base64 ) {
    +                      $origLinkStripped = substr($origLink, 5);
    +                      $ret .= 'src="'.$origLinkStripped.'" ';
    +                      $ret .= "_fck_mw_filename=\"{$origLinkStripped}\" ";
    +                      $ret .= '/>';
    +                      return false;
    +              }
    +
                   if( $found ) {
                           $ret .= "src=\"{$url}\" ";
                           /**getimagesize returns array (requires php 4 or php 5), f.ex:
    ```

- File: `./extensions/WYSIWYG/CKeditorParser.body.php`:

    ```diff
    diff --git a/extensions/WYSIWYG/CKeditorParser.body.php b/extensions/WYSIWYG/CKeditorParser.body.php
    index f68bac8..dbcbc61 100644
    --- a/extensions/WYSIWYG/CKeditorParser.body.php
    +++ b/extensions/WYSIWYG/CKeditorParser.body.php
    @@ -648,9 +648,9 @@ class CKeditorParser extends CKeditorParserWrapper {
        return $text;
      }

    -	function makeImage( $nt, $options, $holders = false ) {
    +	function makeImage( $nt, $options, $holders = false, $origLink ) {
        CKeditorParser::$fck_mw_makeImage_options = $options;
    -		return parent::makeImage( $nt, $options, $holders );
    +		return parent::makeImage( $nt, $options, $holders, $origLink );
      }

      /**
    ```

- File: `./extensions/WYSIWYG/ckeditor/plugins/mediawiki/dialogs/image.js`:

    ```diff
    diff --git a/extensions/WYSIWYG/ckeditor/plugins/mediawiki/dialogs/image.js b/extensions/WYSIWYG/ckeditor/plugins/mediawiki/dialogs/image.js
    index aadeea6..d97f365 100644
    --- a/extensions/WYSIWYG/ckeditor/plugins/mediawiki/dialogs/image.js
    +++ b/extensions/WYSIWYG/ckeditor/plugins/mediawiki/dialogs/image.js
    @@ -81,11 +81,15 @@ CKEDITOR.dialog.add( 'MWImage', function( editor ) {
                 SrcInWiki = url;
                 // Query the preloader to figure out the url impacted by based href.
                 previewPreloader.setAttribute( 'src', url );
    -			dialog.preview.setAttribute( 'src', previewPreloader.$.src );
    -			updatePreview( dialog );
    +            dialog.preview.setAttribute( 'src', previewPreloader.$.src );
    +            updatePreview( dialog );
    +        }
    +        if ( img.substring(0, 11) == 'data:image/' ) {
    +            LoadPreviewImage( { responseText: img } );
    +        } else {
    +            window.parent.sajax_request_type = 'GET' ;
    +            window.parent.sajax_do_call( 'wfSajaxGetImageUrl', [img], LoadPreviewImage ) ;
             }
    -        window.parent.sajax_request_type = 'GET' ;
    -        window.parent.sajax_do_call( 'wfSajaxGetImageUrl', [img], LoadPreviewImage ) ;
         }

      var DispImgPView = function ( dialog, img ) {  //23.12.14 RL
    @@ -150,8 +154,12 @@ CKEDITOR.dialog.add( 'MWImage', function( editor ) {
                 SetSearchMessage( dialog, editor.lang.mwplugin.searching ) ;

                 // Make an Ajax search for the pages.
    -            window.parent.sajax_request_type = 'GET' ;
    -            window.parent.sajax_do_call( 'wfSajaxSearchImageCKeditor', [link], LoadSearchResults ) ;
    +            if ( link.substring(0, 11) == 'data:image/' ) {
    +                LoadSearchResults( { responseText:link } );
    +            } else {
    +                window.parent.sajax_request_type = 'GET' ;
    +                window.parent.sajax_do_call( 'wfSajaxSearchImageCKeditor', [link], LoadSearchResults ) ;
    +            }
             }

             var LoadSearchResults = function(result) {
    ```

- File: `./extensions/WYSIWYG/ckeditor/plugins/mediawiki/plugin.js`:

    ```diff
    diff --git a/extensions/WYSIWYG/ckeditor/plugins/mediawiki/plugin.js b/extensions/WYSIWYG/ckeditor/plugins/mediawiki/plugin.js
    index 7c30a7f..473d2e4 100644
    --- a/extensions/WYSIWYG/ckeditor/plugins/mediawiki/plugin.js
    +++ b/extensions/WYSIWYG/ckeditor/plugins/mediawiki/plugin.js
    @@ -1832,6 +1832,8 @@ CKEDITOR.customprocessor.prototype =
                  var imgUpright   = htmlNode.getAttribute( '_fck_mw_upright' ) || '';        //31.12.14 RL<-

                  stringBuilder.push( '[[File:' );
    +							if ( imgName.length == 0 )
    +								imgName = src;
                  stringBuilder.push( imgName );

                  if ( imgStyleWidth.length > 0 )
    ```
- At this point, your wiki should fully support base64 images.


