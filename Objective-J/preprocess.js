/*
 * preprocessor.js
 * Objective-J
 *
 * Created by Francisco Tolmasky.
 * Copyright 2008, 280 North, Inc.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 */

OBJJ_PREPROCESSOR_DEBUG_SYMBOLS = 1 << 0;

function objj_preprocess(/*String*/ aString, /*objj_bundle*/ aBundle, /*objj_file*/ aSourceFile, /*unsigned*/ flags) 
{    
    try
    {
        return new objj_preprocessor(aString, aSourceFile, aBundle, flags).fragments();
    }
    catch (anException)
    {
        objj_exception_report(anException, aSourceFile);
    }
    
    return [];
}

OBJJParseException          = "OBJJParseException";
OBJJClassNotFoundException  = "OBJJClassNotFoundException";

var TOKEN_ACCESSORS         = "accessors",
    TOKEN_CLASS             = "class",
    TOKEN_END               = "end",
    TOKEN_FUNCTION          = "function",
    TOKEN_IMPLEMENTATION    = "implementation",
    TOKEN_IMPORT            = "import",
    TOKEN_NEW               = "new",
    TOKEN_SELECTOR          = "selector",
    TOKEN_SUPER             = "super",
                            
    TOKEN_EQUAL             = '=',
    TOKEN_PLUS              = '+',
    TOKEN_MINUS             = '-',
    TOKEN_COLON             = ':',
    TOKEN_COMMA             = ',',
    TOKEN_PERIOD            = '.',
    TOKEN_ASTERISK          = '*',
    TOKEN_SEMICOLON         = ';',
    TOKEN_LESS_THAN         = '<',
    TOKEN_OPEN_BRACE        = '{',
    TOKEN_CLOSE_BRACE       = '}',
    TOKEN_GREATER_THAN      = '>',
    TOKEN_OPEN_BRACKET      = '[',
    TOKEN_DOUBLE_QUOTE      = '"',
    TOKEN_PREPROCESSOR      = '@',
    TOKEN_CLOSE_BRACKET     = ']',
    TOKEN_QUESTION_MARK     = '?',
    TOKEN_OPEN_PARENTHESIS  = '(',
    TOKEN_CLOSE_PARENTHESIS = ')',
    
    TOKEN_WHITESPACE        = /^(?:(?:\s+$)|(?:\/(?:\/|\*)))/,
    TOKEN_NUMBER            = /^[+-]?\d+(([.]\d+)*([eE][+-]?\d+))?$/,
    TOKEN_IDENTIFIER        = /^[a-zA-Z_$](\w|$)*$/;
    
#define IS_WORD(token) /^\w+$/.test(token)

#define IS_NOT_EMPTY(buffer) buffer.atoms.length !== 0
#define CONCAT(buffer, atom) buffer.atoms[buffer.atoms.length] = atom

var SUPER_CLASSES           = new objj_dictionary();

var OBJJ_CURRENT_BUNDLE     = NULL;

// FIXME: Used fixed regex
var objj_lexer = function(aString)
{
    this._index = -1;
    this._tokens = (aString + '\n').match(/\/\/.*(\r|\n)?|\/\*(?:.|\n|\r)*?\*\/|\w+\b|[+-]?\d+(([.]\d+)*([eE][+-]?\d+))?|"[^"\\]*(\\[\s\S][^"\\]*)*"|'[^'\\]*(\\[\s\S][^'\\]*)*'|\s+|./g);
    this._context = [];
    
    return this;
}

objj_lexer.prototype.push = function()
{
    this._context.push(this._index);
}

objj_lexer.prototype.pop = function()
{
    this._index = this._context.pop();
}

objj_lexer.prototype.peak = function(shouldSkipWhitespace)
{
    if (shouldSkipWhitespace)
    {
        this.push();
        var token = this.skip_whitespace();
        this.pop();
        
        return token;
    }
    
    return this._tokens[this._index + 1];
}

objj_lexer.prototype.next = function()
{
    return this._tokens[++this._index];
}

objj_lexer.prototype.previous = function()
{
    return this._tokens[--this._index];
}

objj_lexer.prototype.last = function()
{
    if (this._index < 0)
        return NULL;
    
    return this._tokens[this._index - 1];
}

objj_lexer.prototype.skip_whitespace= function(shouldMoveBackwards)
{   
    var token;
    
    if (shouldMoveBackwards)
        while((token = this.previous()) && TOKEN_WHITESPACE.test(token)) ;
    else
        while((token = this.next()) && TOKEN_WHITESPACE.test(token)) ;

    return token;
}

var objj_stringBuffer = function()
{
    this.atoms = [];
}

objj_stringBuffer.prototype.toString = function()
{
    return this.atoms.join("");
}

objj_stringBuffer.prototype.clear = function()
{
    this.atoms = [];
}

objj_stringBuffer.prototype.isEmpty = function()
{
    return (this.atoms.length === 0);
}

var objj_preprocessor = function(aString, aSourceFile, aBundle, flags)
{
    this._currentClass = "";
    this._currentSuperClass = "";
    
    this._file = aSourceFile;
    this._fragments = [];
    this._preprocessed = new objj_stringBuffer();
    this._tokens = new objj_lexer(aString);
    this._flags = flags;
    this._bundle = aBundle;
    
    this.preprocess(this._tokens, this._preprocessed);
    //alert(this._preprocessed + "");
    this.fragment();
}

objj_preprocessor.prototype.fragments = function()
{
    return this._fragments;
}

objj_preprocessor.prototype.accessors = function(tokens)
{
    var token = tokens.skip_whitespace(),
        attributes = {};

    if (token != TOKEN_OPEN_PARENTHESIS)
    {
        tokens.previous();
        
        return attributes;
    }

    while ((token = tokens.skip_whitespace()) != TOKEN_CLOSE_PARENTHESIS)
    {
        var name = token,
            value = true;

        if (!IS_WORD(name))
            objj_exception_throw(new objj_exception(OBJJParseException, "*** @property attribute name not valid."));

        if ((token = tokens.skip_whitespace()) == TOKEN_EQUAL)
        {
            value = tokens.skip_whitespace();
            
            if (!IS_WORD(value))
                objj_exception_throw(new objj_exception(OBJJParseException, "*** @property attribute value not valid."));

            if (name == "setter")
            {
                if ((token = tokens.next()) != TOKEN_COLON)
                    objj_exception_throw(new objj_exception(OBJJParseException, "*** @property setter attribute requires argument with \":\" at end of selector name."));
                
                value += ":";
            }

            token = tokens.skip_whitespace();
        }

        attributes[name] = value;

        if (token == TOKEN_CLOSE_PARENTHESIS)
            break;
        
        if (token != TOKEN_COMMA)
            objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected ',' or ')' in @property attribute list."));
    }
    
    return attributes;
}

objj_preprocessor.prototype.brackets = function(/*objj_lexer*/ tokens, /*objj_stringBuffer*/ aStringBuffer)
{
    var tuples = [];
        
    while (this.preprocess(tokens, NULL, NULL, NULL, tuples[tuples.length] = [])) ;

    if (tuples[0].length === 1)
    {
        CONCAT(aStringBuffer, '[');
        
        // When we have an empty array literal ([]), tuples[0][0] will be an empty objj_stringBuffer
        CONCAT(aStringBuffer, tuples[0][0]);
        
        CONCAT(aStringBuffer, ']');
    }
    
    else
    {
        var selector = new objj_stringBuffer();
        //alert(tuples[0][0].toString() + "]" );
        // The first two arguments are always the receiver and the selector.
        if (tuples[0][0].atoms[0] == TOKEN_SUPER)
        {
            CONCAT(aStringBuffer, "objj_msgSendSuper(");
            CONCAT(aStringBuffer, "{ receiver:self, super_class:" + this._currentSuperClass + " }");
            
        }
        else
        {
            CONCAT(aStringBuffer, "objj_msgSend(");
            CONCAT(aStringBuffer, tuples[0][0]);
        }
        
        CONCAT(selector, tuples[0][1]);
        
        var index = 1,
            count = tuples.length,
            marg_list = new objj_stringBuffer();
        
        for(; index < count; ++index)
        {
            var pair = tuples[index];
            
            CONCAT(selector, pair[1])
            CONCAT(marg_list, ", " + pair[0]);
        }
        
        CONCAT(aStringBuffer, ", \"");
        CONCAT(aStringBuffer, selector); // FIXME: sel_getUid(selector + "") ?
        CONCAT(aStringBuffer, '\"');
        CONCAT(aStringBuffer, marg_list);
        CONCAT(aStringBuffer, ')');
    }
}

objj_preprocessor.prototype.directive = function(tokens, aStringBuffer, allowedDirectivesFlags)
{
    // Grab the next token, preprocessor directives follow '@' immediately.
    var buffer = aStringBuffer ? aStringBuffer : new objj_stringBuffer(),
        token = tokens.next();
            
    // To provide compatibility with Objective-C files, we convert NSString literals into 
    // toll-freed JavaScript/CPString strings.
    if (token.charAt(0) == TOKEN_DOUBLE_QUOTE)
        CONCAT(buffer, token);
    
    // Currently we simply swallow forward declarations and only provide them to allow 
    // compatibility with Objective-C files.
    else if (token == TOKEN_CLASS)
    {
        tokens.skip_whitespace();
        
        return;
    }
    
    // @implementation Class implementations
    else if (token == TOKEN_IMPLEMENTATION)
        this.implementation(tokens, buffer);

    // @import
    else if (token == TOKEN_IMPORT)
        this._import(tokens);

    // @selector
    else if (token == TOKEN_SELECTOR)
        this.selector(tokens, buffer);
    
    else if (token == TOKEN_ACCESSORS)
        return this.accessors(tokens);
    
    if (!aStringBuffer)
        return buffer;
}

objj_preprocessor.prototype.fragment = function()
{
    var preprocessed = this._preprocessed.toString();
    
    // But make sure it's not just all whitespace!
    if ((/[^\s]/).test(preprocessed))
        this._fragments.push(fragment_create_code(preprocessed, this._bundle, this._file));
    
    this._preprocessed.clear();
}

objj_preprocessor.prototype.implementation = function(tokens, /*objj_stringBuffer*/ aStringBuffer)
{
    var buffer = aStringBuffer,
        token = "",
        category = NO,
        class_name = tokens.skip_whitespace(),
        superclass_name = "Nil",
        
        instance_methods = new objj_stringBuffer(),
        class_methods = new objj_stringBuffer();
    
    if (!(/^\w/).test(class_name))
        objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected class name, found \"" + class_name + "\"."));
    
    this._currentSuperClass = NULL;
    this._currentClass = class_name;
    
    // If we reach an open parenthesis, we are declaring a category.
    if((token = tokens.skip_whitespace()) == TOKEN_OPEN_PARENTHESIS)
    {
        token = tokens.skip_whitespace();
        
        if (token == TOKEN_CLOSE_PARENTHESIS)
            objj_exception_throw(new objj_exception(OBJJParseException, "*** Can't Have Empty Category Name for class \"" + class_name + "\"."));
        
        if (tokens.skip_whitespace() != TOKEN_CLOSE_PARENTHESIS)
            objj_exception_throw(new objj_exception(OBJJParseException, "*** Improper Category Definition for class \"" + class_name + "\"."));
        
        CONCAT(buffer, "{\nvar the_class = objj_getClass(\"" + class_name + "\")\n");
        CONCAT(buffer, "if(!the_class) objj_exception_throw(new objj_exception(OBJJClassNotFoundException, \"*** Could not find definition for class \\\"" + class_name + "\\\"\"));\n");
        CONCAT(buffer, "var meta_class = the_class.isa;");
        
        var superclass_name = dictionary_getValue(SUPER_CLASSES, class_name);
        
        // FIXME: We should have a better solution for this case, although it's actually not much slower than the real case.
        if (!superclass_name)
            this._currentSuperClass = "objj_getClass(\"" + class_name + "\").super_class";
        else
            this._currentSuperClass = "objj_getClass(\"" + superclass_name + "\")";
    }
    else
    {
        // If we reach a colon (':'), then a superclass is being declared.
        if(token == TOKEN_COLON)
        {
            token = tokens.skip_whitespace();
            
            if (!TOKEN_IDENTIFIER.test(token))
                objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected class name, found \"" + token + "\"."));
            
            superclass_name = token;
            this._currentSuperClass = "objj_getClass(\"" + superclass_name + "\")";
            
            dictionary_setValue(SUPER_CLASSES, class_name, superclass_name);

            token = tokens.skip_whitespace();
        }
        
        CONCAT(buffer, "{var the_class = objj_allocateClassPair(" + superclass_name + ", \"" + class_name + "\"),\nmeta_class = the_class.isa;");
        
        // If we are at an opening curly brace ('{'), then we have an ivar declaration.
        if (token == TOKEN_OPEN_BRACE)
        {
            var ivar_count = 0,
                declaration = [],
                
                attributes,
                accessors = {};
            
            while((token = tokens.skip_whitespace()) && token != TOKEN_CLOSE_BRACE)
            {
                if (token == TOKEN_PREPROCESSOR)
                    attributes = this.directive(tokens);
                
                else if (token == TOKEN_SEMICOLON)
                {
                    if (ivar_count++ == 0)
                        CONCAT(buffer, "class_addIvars(the_class, [");
                    else
                        CONCAT(buffer, ", ");
                    
                    var name = declaration[declaration.length - 1];
                    
                    CONCAT(buffer, "new objj_ivar(\"" + name + "\")");
                    
                    declaration = [];
                    
                    if (attributes)
                    {
                        accessors[name] = attributes;
                        attributes = NULL;
                    }
                }
                else
                    declaration.push(token);
            }
            
            // If we have objects in our declaration, the user forgot a ';'.
            if (declaration.length)
                objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected ';' in ivar declaration, found '}'."));

            if (ivar_count)
                CONCAT(buffer, "]);\n");
            
            if (!token)
                objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected '}'"));
            
            for (ivar_name in accessors)
            {
                var accessor = accessors[ivar_name],
                    property = accessor["property"] || ivar_name;
                    
                // getter
                var getterName = accessor["getter"] || property,
                    getterCode = "(id)" + getterName + "\n{\nreturn " + ivar_name + ";\n}";

                if (IS_NOT_EMPTY(instance_methods))
                    CONCAT(instance_methods, ",\n");
                
                CONCAT(instance_methods, this.method(new objj_lexer(getterCode)));
                
                // setter
                if (accessor["readonly"])
                    continue;
                
                var setterName = accessor["setter"];
                
                if (!setterName)
                {
                    var start = property.charAt(0) == '_' ? 1 : 0;
                    setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":";
                }
                
                var setterCode = "(void)" + setterName + "(id)newValue\n{\n";
                
                if (accessor["copy"])
                    setterCode += "if (" + ivar_name + " !== newValue)\n" + ivar_name + " = [newValue copy];\n}";
                else
                    setterCode += ivar_name + " = newValue;\n}";
                
                if (IS_NOT_EMPTY(instance_methods))
                    CONCAT(instance_methods, ",\n");
                
                CONCAT(instance_methods, this.method(new objj_lexer(setterCode)));
            }
        }
        else
            tokens.previous();
        
        // We must make a new class object for our class definition.
        CONCAT(buffer, "objj_registerClassPair(the_class);\n");

        // Add this class to the current bundle.
        CONCAT(buffer, "objj_addClassForBundle(the_class, objj_getBundleWithPath(OBJJ_CURRENT_BUNDLE.path));\n");
    }
    
    while ((token = tokens.skip_whitespace()))
    {
        if (token == TOKEN_PLUS)
        {
            if (IS_NOT_EMPTY(class_methods))
                CONCAT(class_methods, ", ");
            
            CONCAT(class_methods, this.method(tokens));
        }
        
        else if (token == TOKEN_MINUS)
        {
            if (IS_NOT_EMPTY(instance_methods))
                CONCAT(instance_methods, ", ");
            
            CONCAT(instance_methods, this.method(tokens));
        }
        
        // Check if we've reached @end...
        else if (token == TOKEN_PREPROCESSOR)
        {
            // The only preprocessor directive we should ever encounter at this point is @end.
            if ((token = tokens.next()) == TOKEN_END)
                break;
            
            else
                objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected \"@end\", found \"@" + token + "\"."));
        }
    }
    
    if (IS_NOT_EMPTY(instance_methods))
    {
        CONCAT(buffer, "class_addMethods(the_class, [");
        CONCAT(buffer, instance_methods);
        CONCAT(buffer, "]);\n");
    }
    
    if (IS_NOT_EMPTY(class_methods))
    {
        CONCAT(buffer, "class_addMethods(meta_class, [");
        CONCAT(buffer, class_methods);
        CONCAT(buffer, "]);\n");
    }
    
    CONCAT(buffer, '}');
}

objj_preprocessor.prototype._import = function(tokens)
{
    // The introduction of an import statement forces the creation of a code fragment.
    this.fragment();
    
    var path = "",
        token = tokens.skip_whitespace(),
        isLocal = (token != TOKEN_LESS_THAN);

    if (token == TOKEN_LESS_THAN)
    {
        while((token = tokens.next()) && token != TOKEN_GREATER_THAN)
            path += token;
        
        if(!token)
            objj_exception_throw(new objj_exception(OBJJParseException, "*** Unterminated import statement."));
    }
    
    else if (token.charAt(0) == TOKEN_DOUBLE_QUOTE)
        path = token.substr(1, token.length - 2);
    
    else
        objj_exception_throw(new objj_exception(OBJJParseException, "*** Expecting '<' or '\"', found \"" + token + "\"."));
    
    this._fragments.push(fragment_create_file(path, NULL, isLocal, this._file));
}

objj_preprocessor.prototype.method = function(tokens)
{
    var buffer = new objj_stringBuffer(),
        token,
        selector = "",
        parameters = [];
    
    while((token = tokens.skip_whitespace()) && token != TOKEN_OPEN_BRACE)
    {
        if (token == TOKEN_COLON)
        {
            // Colons are part of the selector name
            selector += token;
            
            token = tokens.skip_whitespace();
            
            if (token == TOKEN_OPEN_PARENTHESIS)
            {
                // Swallow parameter/return type.  Perhaps later we can use this for debugging?
                while((token = tokens.skip_whitespace()) && token != TOKEN_CLOSE_PARENTHESIS) ;
    
                token = tokens.skip_whitespace();
            }
            
            // Since this follows a colon, this must be the parameter name.
            parameters[parameters.length] = token;
        }
        
        else if (token == TOKEN_OPEN_PARENTHESIS)
            // Since :( is handled above, this must be the return type, just swallow it.
            while((token = tokens.skip_whitespace()) && token != TOKEN_CLOSE_PARENTHESIS) ;
        
        // Argument list ", ..."
        else if (token == TOKEN_COMMA)
        {
            // At this point, "..." MUST follow.
            if ((token = tokens.skip_whitespace()) != TOKEN_PERIOD || tokens.next() != TOKEN_PERIOD || tokens.next() != TOKEN_PERIOD)
                objj_exception_throw(new objj_exception(OBJJParseException, "*** Argument list expected after ','."));
            
            // FIXME: Shouldn't allow any more after this.
        }
        
        // Build selector name.
        else
            selector += token;
    }

    var index = 0,
        count = parameters.length;
    
    CONCAT(buffer, "new objj_method(sel_getUid(\"");
    CONCAT(buffer, selector);
    CONCAT(buffer, "\"), function");
    
    if (this._flags & OBJJ_PREPROCESSOR_DEBUG_SYMBOLS)
        CONCAT(buffer, " $" + this._currentClass + "__" + selector.replace(/:/g, "_"));
    
    CONCAT(buffer, "(self, _cmd");
    
    for(; index < count; ++index)
    {
        CONCAT(buffer, ", ");
        CONCAT(buffer, parameters[index]);
    }

    CONCAT(buffer, ")\n{ with(self)\n{");
    CONCAT(buffer, this.preprocess(tokens, NULL, TOKEN_CLOSE_BRACE, TOKEN_OPEN_BRACE));
    CONCAT(buffer, "}\n})");

    return buffer;
}

objj_preprocessor.prototype.preprocess = function(tokens, /*objj_stringBuffer*/ aStringBuffer, terminator, instigator, tuple)
{
    var buffer = aStringBuffer ? aStringBuffer : new objj_stringBuffer(),
        count = 0,
        token = "";

    if (tuple)
    {
        tuple[0] = buffer;
        
        var bracket = false,
            closures = [0, 0, 0];
    }
    
    while ((token = tokens.next()) && ((token != terminator) || count))
    {
        if (tuple)
        {
            // Ignore :'s the belong to tertiary operators (?:) 
            if (token === TOKEN_QUESTION_MARK)
                ++closures[2];
            
            // Ingore anything between { } and ()                
            else if (token === TOKEN_OPEN_BRACE)
                ++closures[0];
                
            else if (token === TOKEN_CLOSE_BRACE)
                --closures[0];
            
            else if (token === TOKEN_OPEN_PARENTHESIS)
                ++closures[1];
                
            else if (token === TOKEN_CLOSE_PARENTHESIS)
                --closures[1];
            
            // If not in {} and not in () and this is a colon and we don't belong to a tertiary operator OR this is a closing bracket...
            else if ((token === TOKEN_COLON && closures[2]-- === 0 || 
                    (bracket = (token === TOKEN_CLOSE_BRACKET))) &&
                    closures[0] === 0 && closures[1] === 0)
            {
                tokens.push(); // 1
                
                // If a bracket made us enter, go backwards skipping whitespace ([a b   ] allowed), 
                // if not grab token immediately behind us ([a b  : c] not allowed
                var label = bracket ? tokens.skip_whitespace(true) : tokens.previous(),
                    isEmptyLabel = TOKEN_WHITESPACE.test(label);
                
                // The label must be an identifier, and preceded by whitespace, or whitespace itself (the "empty label")
                if (isEmptyLabel || TOKEN_IDENTIFIER.test(label) && TOKEN_WHITESPACE.test(tokens.previous()))
                {
                    tokens.push(); // 2
                    
                    var last = tokens.skip_whitespace(true),
                        operatorCheck = true,
                        isDoubleOperator = false;
                    
                    // unary or binary, still disables.
                    // + - + x is bad because it could be (+ - + x) or (a + - + x)
                    // the only good is unbroken chain
                    if (last === '+' || last === '-'){//alert(tokens.last())
                        if (tokens.previous() !== last)
                            operatorCheck = false;
                        else
                        {
                            last = tokens.skip_whitespace(true);
                            isDoubleOperator = true;
                        }}
                        
                    tokens.pop(); // 2
                    
                    tokens.pop(); // 1
                    
                    //alert(operatorCheck + "operatorCheck for " + label + " and " + last);
                    if (operatorCheck && (
                    
                        // <)> <label><:|]>
                        // <}> <label><:|]>
                        // <]> <label><:|]>                        
                        (!isDoubleOperator && (last === TOKEN_CLOSE_BRACE)) || 
                        
                        last === TOKEN_CLOSE_PARENTHESIS || last === TOKEN_CLOSE_BRACKET || 
                    
                    // <.> label<:|]> --> 5. label
                    // <5> label<:|]>
                        last === TOKEN_PERIOD || TOKEN_NUMBER.test(last) ||
                        
                    // <string> <label><:\]>/
                        last.charAt(last.length - 1) === '\"' || last.charAt(last.length - 1) === '\'' || 
                    
                    // <identifier-not> <label><:|]>
                        TOKEN_IDENTIFIER.test(last) && !/^(new|return|case|var)$/.test(last)))
                    {
                        if (isEmptyLabel)
                            tuple[1] = ':';
                        else
                        {
                            tuple[1] = label;
                        
                            if (!bracket)
                                tuple[1] += ':';
                                
                            var count = buffer.atoms.length;
                    
                            while (buffer.atoms[count--] !== label) ;
                
                            buffer.atoms.length = count;
                        }
                        
                        return !bracket;
                    }
                
                    if (bracket)
                        return NO;
                }
                
                tokens.pop(); // 2
                
                if (bracket)
                    return NO;    
            }
            
            closures[2] = MAX(closures[2], 0);
        }
            
        if (instigator)
        { 
            if (token == instigator)
                ++count;
            
            else if (token == terminator) 
                --count;    
        }
        
        // imports are deprecated in favor of @imort
        if(token == TOKEN_IMPORT)
        {
            objj_fprintf(warning_stream, this._file.path + ": import keyword is deprecated, use @import instead.");
            
            this._import(tokens);
        }
        
        // Safari can't handle function declarations of the form function [name]([arguments]) { } 
        // in evals.  It requires them to be in the form [name] = function([arguments]) { }.  So we 
        // need to find these and fix them.
        else if (token === TOKEN_FUNCTION)
        {//if (window.p) alert("function");
            var accumulator = "";
        
            // Following the function identifier we can either have an open parenthesis or an identifier:
            while((token = tokens.next()) && token != TOKEN_OPEN_PARENTHESIS && !(/^\w/).test(token))
                accumulator += token;
            
            // If the next token is an open parenthesis, we have a standard function and we don't have to 
            // change it:
            if (token === TOKEN_OPEN_PARENTHESIS)
            {
                CONCAT(buffer, "function" + accumulator + '(');
                
                if (tuple)
                    ++closures[1];
            }
            // If it's not a parenthesis, we know we have a non-supported function declaration, so fix it:
            else
            {
                CONCAT(buffer, token + "= function");
            
#if FIREBUG
                var functionName = token;

                // Skip everything until the next close parenthesis.
                while((token = tokens.next()) && token != TOKEN_CLOSE_PARENTHESIS)
                    CONCAT(buffer, token);
                    
                // Don't forget the last token!
                CONCAT(buffer, token);
                
                // Skip everything until the next open curly brace. 
                while((token = tokens.next()) && token != TOKEN_OPEN_BRACE)
                    CONCAT(buffer, token);
                
                if (tuple)
                    ++closures[2];
                
                // Place the open curly brace as well, and the function name
                CONCAT(buffer, token + "\n \"__FIREBUG_FNAME__" + functionName + "\".length;\n");
#endif
            }
        }
        
        // If we reach an @ symbol, we are at a preprocessor directive.
        else if (token == TOKEN_PREPROCESSOR)
            this.directive(tokens, buffer);
        
        // If we reach a bracket, we will either be preprocessing a message send, a literal 
        // array, or an array index.
        else if (token == TOKEN_OPEN_BRACKET)
            this.brackets(tokens, buffer);
                
        // If not simply append the token.
        else
            CONCAT(buffer, token);
    }
    
    if (!aStringBuffer)
        return buffer;
}

objj_preprocessor.prototype.selector = function(tokens, aStringBuffer)
{
    var buffer = aStringBuffer ? aStringBuffer : new objj_stringBuffer();
    
    CONCAT(buffer, "sel_getUid(\"");
    
    // Swallow open parenthesis.
    if (tokens.skip_whitespace() != TOKEN_OPEN_PARENTHESIS)
        objj_exception_throw(new objj_exception(OBJJParseException, "*** Expected ')'"));
    
    // Eat leading whitespace
    var selector = tokens.skip_whitespace();
    
    if (selector == TOKEN_CLOSE_PARENTHESIS)
        objj_exception_throw(new objj_exception(OBJJParseException, "*** Unexpected ')', can't have empty @selector()"));
    
    CONCAT(aStringBuffer, selector);
    
    var token,
        starting = true;
    
    while ((token = tokens.next()) && token != TOKEN_CLOSE_PARENTHESIS)
    {
        if (starting && /^\d+$/.test(token) || !(/^(\w|$|\:)/.test(token)))
        {
            // Only allow tail whitespace
            if (!(/\S/).test(token))
                if (tokens.skip_whitespace() == TOKEN_CLOSE_PARENTHESIS)
                    break;
                else
                    objj_exception_throw(new objj_exception(OBJJParseException, "*** Unexpected whitespace in @selector()."));
            else
                objj_exception_throw(new objj_exception(OBJJParseException, "*** Illegal character '" + token + "' in @selector()."));
        }
        
        CONCAT(buffer, token);
        starting = (token == TOKEN_COLON);
    }
    
    CONCAT(buffer, "\")");

    if (!aStringBuffer)
        return buffer;
}
