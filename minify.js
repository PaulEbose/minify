/* Модуль сжатия js-скриптов, css-стилей, html-файлов и
 * конвертации картинок в css-стилях 
 * в base64 и помещения их в файл стилей
 */
(function(){
    'use strict';
    
   
    var DIR         = __dirname +'/',
        LIBDIR      = DIR + 'lib/',
        main        = require(LIBDIR + 'main'),
        img         = main.require(LIBDIR + 'img'),
        
        crypto      = main.crypto,
        fs          = main.fs,
        path        = main.path,
        Util        = main.util,
        
        /* object contains hashes of files*/
        HASHESNAME  = DIR           + 'hashes',
        HASHES_JSON = HASHESNAME    + '.json',
        
        Hashes      = main.require(HASHESNAME) || [],
        HashesChanged;
    
    var MinFolder   = DIR + 'min/';
    
    function makeFolder(pExist){
        /* Trying to create folder min
         * where woud be minifyed versions
         * of files 511(10)=777(8)
         * rwxrwxrwx
         */
        if(!pExist)
            fs.mkdir(MinFolder, 511, function(pError){
                if(pError){
                    Util.log(pError);
                    MinFolder = '/';
                }
            });
    }
    
    fs.exists(MinFolder, makeFolder);
    
    /**
     * function minificate js,css and html files
     * @param pFiles_a  -   array of js, css and html file names or string, if name
     *                      single, or object if postProcessing neaded
     *                          {'client.js': function(pFinalCode){} }
     *                      or convertion images to base64 neaded
     *                          {'style.css': true}
     *                       or {'style.css':{minimize: true, func: function(){}}
     *
     * @param pOptions  -   object contain main options
     *
     * Example: 
     * {callback: func(pData){}}
     */
    function optimize(pFiles, pOptions){
        var lFiles = Util.isArray(pFiles) ? pFiles : [pFiles],
            
            lName       = '',
            lAllCSS     = '',
            /* varible contains all readed files count */
            lReadedFilesCount = 0,
            
            /**
             * Processing of files
             * @param pFileData_o {name, data}
             */
            dataReaded_f = function(pFileData_o){
                ++lReadedFilesCount;
                
                var lFileName   = pFileData_o.name,
                    lData       = pFileData_o.data,
                    lIsLastFile = lReadedFilesCount === lFiles.length;
                
                /*
                 * if postProcessing function exist
                 * getting it from lFileName object
                 */
                var lOptimizeParams;
                if( Util.isObject(lFileName) ){
                    var lName;
                    for(lName in lFileName){
                        break;
                    }
                    
                    lOptimizeParams = lFileName[lName];
                    lFileName       = lName;
                }
                Util.log('minify: file ' + path.basename(lFileName) + ' readed');
                
                var lExt            = Util.getExtension(lFileName),
                    lMinFileName    = getName(lFileName, lExt);
                
               
                var lWritedCallBack =  function(pData){
                    if(pOptions){
                        if(pOptions.returnName)
                             Util.exec(pOptions.callback, {
                                 name: lMinFileName
                             });
                         else
                            Util.exec(pOptions.callback, pData);
                    }
                };
               
                var lProcessing_f = function(pData){
                    pData = main.optimize({
                        ext : lExt,
                        data: pData
                    });
                    
                    Util.ifExec(lExt !== '.css', function(pOptData){
                        var lRet = Util.isString(pOptData);
                        if(lRet)
                            pData = pOptData;
                        
                        if (lIsLastFile)
                            saveAllCSS(lOptimizeParams, lAllCSS);
                        
                        writeFile(lMinFileName, pData, lWritedCallBack);
                    },function(pCallBack){
                        lAllCSS    += pData;
                        
                        img.optimize(pData, function(){
                            Util.exec(pCallBack, pData);
                        });
                            
                    });
                };
                    
                if((pOptions && pOptions.force) || isFileChanged(lFileName, lData, lIsLastFile))
                    lProcessing_f(lData);
                
                /* if file was not changed */
                else
                    fs.readFile(lMinFileName, function(pError, pFinalCode){
                        /* if could not read file call forse minification */
                        if(pError)
                            lProcessing_f(lData);
                        
                        else {
                           writeFile(lMinFileName, pFinalCode, lWritedCallBack);
                            
                            if(lExt === '.css')
                                lAllCSS += pFinalCode;
                        }
                        
                         if(lIsLastFile)
                            saveAllCSS(lOptimizeParams, lAllCSS);
                    });
            };
        
        /* moving thru all elements of js files array */
        for(var i=0; lFiles[i]; i++){
            /* if postProcessing function exist
             * getting file name and passet next
             */
            var lPostProcessing_o = lFiles[i];
            if( Util.isObject(lPostProcessing_o) )
                for(lName in lPostProcessing_o)
                    break;
            else
                lName = lFiles[i];
            
            Util.log('minify: reading file ' + path.basename(lName) + '...');
            
            /* if it's last file send true */
             fs.readFile(lName, Util.call(fileReaded, {
                name    : lFiles[i],
                callback: dataReaded_f
            }));
        }
    }
    
    /**
     * function get name of file in min folder
     * @param pName
     */
    function getName(pName, pExt){
        var lRet;
        
        if( Util.isString(pName) ){
        
            var lExt        = pExt || Util.getExtension(pName),
                lMinFileName = crypto.createHash('sha1')
                    .update(pName)
                    .digest('hex') + lExt;
            
            lRet = MinFolder + lMinFileName;
        }
        
        return lRet;
    }
    
    /* Функция создаёт асинхроную версию 
     * для чтения файла
     * @pFileName       - имя считываемого файла
     * @pProcessFunc    - функция обработки файла
     */
    function fileReaded(pParams){
        var lRet =  Util.checkObj(pParams, ['error', 'data']) &&
                    Util.checkObjTrue(pParams.params, ['name', 'callback']);
        
        if(lRet){
            var p = pParams,
                d = p.params;
            
            Util.log(p.error);
            p.data = p.data.toString();
            
            Util.exec(d.callback, {
                name: d.name,
                data: p.data
            });
        }
    }
    
    /*
     * Функция записывает файла
     * и выводит ошибку или сообщает,
     * что файл успешно записан
     */
    function writeFile(pName, pData, pCallBack){
        fs.writeFile(pName, pData, function(pError){
            if(pError)
                Util.log(pError);
            else{
                pName = path.basename(pName);
                Util.log('minify: file ' + pName + ' writed...');
            }
            
            Util.exec(pCallBack, pData);
        });
    }
    
    function saveAllCSS(pParams, pData){
       if(pParams && pParams.merge){
           var lPath = MinFolder + 'all.min.css';
           writeFile(lPath, pData);
        }
    }
    
    function isFileChanged(pFileName, pFileData, pLastFile_b){
        var lReadedHash,
            i, n = Hashes.length;
        
        for(i = 0; i < n; i++){
            var lData = Hashes[i];
            
            /* if founded row with file name - save hash */
            if(lData.name === pFileName){
                lReadedHash = lData.hash;
                break;
            }
        }
        
        /* create hash of file data */ 
        var lFileHash   = crypto.createHash('sha1')
            .update(pFileData)
            .digest('hex');
        
        /* boolean hashes.json changed or not */
        if(lReadedHash !== lFileHash){
            Hashes[i]       = {
                name: pFileName,
                hash: lFileHash
            };
            
            HashesChanged   = true;
        }
        
        if(pLastFile_b){
            /* if hashes file was changes - write it */
            if(HashesChanged)
                writeFile(HASHES_JSON, Util.stringifyJSON(Hashes));
            else
                Util.log('minify: no one file has been changed');
        }
        /* has file changed? */
        return lFileHash;
    }
        
    exports.getName     = getName;
    exports.optimize    = optimize;
    exports.MinFolder   = MinFolder;
    
})();